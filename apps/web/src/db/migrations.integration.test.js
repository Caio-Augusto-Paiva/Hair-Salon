import { startTestDatabase, stopTestDatabase } from "./test-database.js";
import { describe, expect, it } from "vitest";

describe("PostgreSQL migration lifecycle", () => {
  it("applies extensions and journaled migrations idempotently on repeated runs", async () => {
    const testDatabase = await startTestDatabase();
    try {
      const { connectionString, pool: verificationPool } = testDatabase;
      const { runMigrations } = await import("./migrate.js");

      await runMigrations(connectionString);
      await runMigrations(connectionString);

      const extensions = await verificationPool.query(
        `select extname from pg_extension where extname in ('btree_gist', 'pgcrypto') order by extname`,
      );
      expect(
        extensions.rows.map(/** @param {any} row */ (row) => row.extname),
      ).toEqual(["btree_gist", "pgcrypto"]);

      const journal = await verificationPool.query(
        `select count(*)::int as count from "drizzle"."__drizzle_migrations"`,
      );
      expect(journal.rows[0].count).toBe(2);

      const tables = await verificationPool.query(
        `select table_name from information_schema.tables
         where table_schema = 'public' order by table_name`,
      );
      expect(tables.rows.map(/** @param {any} row */ (row) => row.table_name)).toEqual([
        "accounts",
        "appointments",
        "audit_log",
        "auth_events",
        "calendar_syncs",
        "cancellation_credits",
        "employee_services",
        "employees",
        "integration_outbox",
        "password_reset_tokens",
        "portfolio_items",
        "privacy_requests",
        "reminder_deliveries",
        "schedule_blocks",
        "schedule_entries",
        "services",
        "users",
      ]);

      const schedulingColumns = await verificationPool.query(
        `select table_name, column_name, data_type
         from information_schema.columns
         where table_schema = 'public'
           and table_name in ('schedule_entries', 'appointments', 'schedule_blocks', 'cancellation_credits')
           and column_name in ('starts_at', 'ends_at', 'available_at', 'cancelled_at', 'created_at', 'updated_at')
         order by table_name, column_name`,
      );
      expect(schedulingColumns.rows.length).toBeGreaterThanOrEqual(8);
      expect(schedulingColumns.rows.every(/** @param {any} row */ (row) => row.data_type === "timestamp with time zone")).toBe(true);

      const constraints = await verificationPool.query(
        `select conname from pg_constraint
         where conrelid in (
           'public.schedule_entries'::regclass,
           'public.cancellation_credits'::regclass,
           'public.services'::regclass,
           'public.appointments'::regclass
         )
         and conname in (
           'schedule_entries_valid_interval',
           'schedule_entries_no_employee_overlap',
           'cancellation_credits_slot_number',
           'services_duration_positive',
           'services_price_non_negative',
           'appointments_duration_positive',
           'appointments_price_non_negative'
         )
         order by conname`,
      );
      expect(constraints.rows.map(/** @param {any} row */ (row) => row.conname)).toEqual([
        "appointments_duration_positive",
        "appointments_price_non_negative",
        "cancellation_credits_slot_number",
        "schedule_entries_no_employee_overlap",
        "schedule_entries_valid_interval",
        "services_duration_positive",
        "services_price_non_negative",
      ]);

      const uniqueIndexes = await verificationPool.query(
        `select indexname from pg_indexes
         where schemaname = 'public'
           and indexname in (
             'users_email_normalized_unique',
             'accounts_provider_identity_unique',
             'appointments_schedule_entry_unique',
             'schedule_blocks_schedule_entry_unique',
             'integration_outbox_idempotency_unique',
             'cancellation_credits_client_slot_unique'
           )
         order by indexname`,
      );
      expect(uniqueIndexes.rows.map(/** @param {any} row */ (row) => row.indexname)).toEqual([
        "accounts_provider_identity_unique",
        "appointments_schedule_entry_unique",
        "cancellation_credits_client_slot_unique",
        "integration_outbox_idempotency_unique",
        "schedule_blocks_schedule_entry_unique",
        "users_email_normalized_unique",
      ]);
    } finally {
      await stopTestDatabase(testDatabase);
    }
  });
});
