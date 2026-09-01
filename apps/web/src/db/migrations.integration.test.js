import { startTestDatabase, stopTestDatabase } from "./test-database.js";
import { describe, expect, it } from "vitest";

/** @param {string} definition */
function normalizeDefinition(definition) {
  return definition.toLowerCase().replace(/[\s"()]+/gu, "");
}

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
      expect(journal.rows[0].count).toBe(4);

      const tables = await verificationPool.query(
        `select table_name from information_schema.tables
         where table_schema = 'public' order by table_name`,
      );
      expect(tables.rows.map(/** @param {any} row */ (row) => row.table_name)).toEqual([
        "accounts",
        "appointments",
        "audit_log",
        "auth_events",
        "auth_rate_limits",
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

      const authRateLimitColumns = await verificationPool.query(
        `select column_name, data_type, is_nullable, column_default
         from information_schema.columns
         where table_schema = 'public'
           and table_name = 'auth_rate_limits'
         order by ordinal_position`,
      );
      expect(authRateLimitColumns.rows).toEqual([
        {
          column_name: "bucket_key",
          data_type: "text",
          is_nullable: "NO",
          column_default: null,
        },
        {
          column_name: "window_started_at",
          data_type: "timestamp with time zone",
          is_nullable: "NO",
          column_default: null,
        },
        {
          column_name: "attempts",
          data_type: "integer",
          is_nullable: "NO",
          column_default: "0",
        },
        {
          column_name: "blocked_until",
          data_type: "timestamp with time zone",
          is_nullable: "YES",
          column_default: null,
        },
        {
          column_name: "updated_at",
          data_type: "timestamp with time zone",
          is_nullable: "NO",
          column_default: "now()",
        },
      ]);
      expect(
        authRateLimitColumns.rows.some(
          /** @param {any} row */ (row) => /email|ip|network|identity/iu.test(row.column_name),
        ),
      ).toBe(false);

      const authRateLimitPrimaryKey = await verificationPool.query(
        `select constraint_row.conname,
                array_agg(attribute.attname::text order by key_column.ordinality) as columns
           from pg_constraint as constraint_row
           cross join lateral unnest(constraint_row.conkey)
             with ordinality as key_column(attnum, ordinality)
           join pg_attribute as attribute
             on attribute.attrelid = constraint_row.conrelid
            and attribute.attnum = key_column.attnum
          where constraint_row.conrelid = 'public.auth_rate_limits'::regclass
            and constraint_row.contype = 'p'
          group by constraint_row.conname`,
      );
      expect(authRateLimitPrimaryKey.rows).toEqual([
        { conname: "auth_rate_limits_pkey", columns: ["bucket_key"] },
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
        `select conname, pg_get_constraintdef(oid) as definition from pg_constraint
         where conrelid in (
           'public.auth_rate_limits'::regclass,
           'public.schedule_entries'::regclass,
           'public.cancellation_credits'::regclass,
           'public.services'::regclass,
           'public.appointments'::regclass
         )
         and conname in (
           'auth_rate_limits_attempts_non_negative',
           'auth_rate_limits_blocked_after_window',
           'auth_rate_limits_bucket_key_format',
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
        "auth_rate_limits_attempts_non_negative",
        "auth_rate_limits_blocked_after_window",
        "auth_rate_limits_bucket_key_format",
        "cancellation_credits_slot_number",
        "schedule_entries_no_employee_overlap",
        "schedule_entries_valid_interval",
        "services_duration_positive",
        "services_price_non_negative",
      ]);
      const authRateLimitChecks = Object.fromEntries(
        constraints.rows
          .filter(/** @param {any} row */ (row) => row.conname.startsWith("auth_rate_limits_"))
          .map(/** @param {any} row */ (row) => [row.conname, row.definition]),
      );
      expect(Object.fromEntries(
        Object.entries(authRateLimitChecks).map(([name, definition]) => [
          name,
          normalizeDefinition(definition),
        ]),
      )).toEqual({
        auth_rate_limits_attempts_non_negative: "checkattempts>=0",
        auth_rate_limits_blocked_after_window:
          "checkblocked_untilisnullorblocked_until>window_started_at",
        auth_rate_limits_bucket_key_format:
          "checkbucket_key~'^[0-9a-f]{64}$'::text",
      });

      const uniqueIndexes = await verificationPool.query(
        `select indexname from pg_indexes
         where schemaname = 'public'
           and indexname in (
             'users_email_normalized_unique',
             'accounts_provider_identity_unique',
             'appointments_schedule_entry_unique',
             'schedule_blocks_schedule_entry_unique',
             'integration_outbox_idempotency_unique',
             'cancellation_credits_client_slot_unique',
             'auth_rate_limits_expiry_idx'
           )
         order by indexname`,
      );
      expect(uniqueIndexes.rows.map(/** @param {any} row */ (row) => row.indexname)).toEqual([
        "accounts_provider_identity_unique",
        "appointments_schedule_entry_unique",
        "auth_rate_limits_expiry_idx",
        "cancellation_credits_client_slot_unique",
        "integration_outbox_idempotency_unique",
        "schedule_blocks_schedule_entry_unique",
        "users_email_normalized_unique",
      ]);

      const authRateLimitExpiryIndex = await verificationPool.query(
        `select index_relation.relname as index_name,
                pg_get_indexdef(index_relation.oid) as definition,
                array_agg(attribute.attname::text order by key_column.ordinality) as columns
           from pg_class as table_relation
           join pg_index as index_row on index_row.indrelid = table_relation.oid
           join pg_class as index_relation on index_relation.oid = index_row.indexrelid
           cross join lateral unnest(index_row.indkey)
             with ordinality as key_column(attnum, ordinality)
           join pg_attribute as attribute
             on attribute.attrelid = table_relation.oid
            and attribute.attnum = key_column.attnum
          where table_relation.oid = 'public.auth_rate_limits'::regclass
            and index_relation.relname = 'auth_rate_limits_expiry_idx'
          group by index_relation.relname, index_relation.oid`,
      );
      expect(authRateLimitExpiryIndex.rows).toHaveLength(1);
      expect(authRateLimitExpiryIndex.rows[0]).toMatchObject({
        index_name: "auth_rate_limits_expiry_idx",
        columns: ["blocked_until"],
      });
      expect(normalizeDefinition(authRateLimitExpiryIndex.rows[0].definition)).toBe(
        "createindexauth_rate_limits_expiry_idxonpublic.auth_rate_limitsusingbtreeblocked_until",
      );

      const schedulingLocking = await verificationPool.query(
        `select pg_get_functiondef(
                  'ensure_schedule_entry_has_one_detail()'::regprocedure
                ) as detail_function,
                exists (
                  select 1
                    from pg_trigger
                   where tgrelid = 'public.schedule_entries'::regclass
                     and tgname = 'schedule_entries_serialize_active_write'
                     and not tgisinternal
                ) as serialization_trigger`,
      );
      expect(schedulingLocking.rows[0].detail_function).toMatch(/FOR NO KEY UPDATE/iu);
      expect(schedulingLocking.rows[0].detail_function).not.toMatch(/FOR UPDATE/iu);
      expect(schedulingLocking.rows[0].serialization_trigger).toBe(true);
    } finally {
      await stopTestDatabase(testDatabase);
    }
  });

  it("serializes concurrent appointment and block detail writes for one entry", async () => {
    const testDatabase = await startTestDatabase();
    try {
      const { connectionString, pool } = testDatabase;
      const { runMigrations } = await import("./migrate.js");
      await runMigrations(connectionString);

      const employee = await pool.query(
        `insert into users (name, email_normalized, role)
         values ('Test Employee', 'employee@example.com', 'EMPLOYEE')
         returning id`,
      );
      const client = await pool.query(
        `insert into users (name, email_normalized, role)
         values ('Test Client', 'client@example.com', 'CLIENT')
         returning id`,
      );
      const employeeId = employee.rows[0].id;
      const clientId = client.rows[0].id;
      const employeeDetail = await pool.query(
        `insert into employees (user_id, display_name, specialty_summary)
         values ($1, 'Test Employee', 'Test')
         returning id`,
        [employeeId],
      );
      const employeeDetailId = employeeDetail.rows[0].id;

      // The fixture is intentionally bare so both transactions can race to
      // provide the one required detail row.
      await pool.query(`alter table schedule_entries disable trigger user`);
      const entry = await pool.query(
        `insert into schedule_entries (employee_id, starts_at, ends_at, kind)
         values ($1, '2030-01-01T13:00:00Z', '2030-01-01T14:00:00Z', 'APPOINTMENT')
         returning id`,
        [employeeDetailId],
      );
      await pool.query(`alter table schedule_entries enable trigger user`);
      const entryId = entry.rows[0].id;

      const appointmentClient = await pool.connect();
      const blockClient = await pool.connect();
      let readyCount = 0;
      let barrierSettled = false;
      /** @type {unknown} */
      let barrierFailure;
      /** @type {(error?: unknown) => void} */
      let releaseBarrier;
      /** @type {ReturnType<typeof setTimeout>} */
      let barrierTimeout;
      /** @type {Promise<void>} */
      const bothInserted = new Promise((resolve) => {
        releaseBarrier = (error = null) => {
          if (barrierSettled) return;
          barrierSettled = true;
          barrierFailure = error;
          clearTimeout(barrierTimeout);
          resolve();
        };
      });
      barrierTimeout = setTimeout(
        () => releaseBarrier(new Error("Concurrent detail barrier timed out")),
        5_000,
      );
      const waitForBothInserts = async () => {
        readyCount += 1;
        if (readyCount === 2) releaseBarrier?.();
        await bothInserted;
        if (barrierFailure) throw barrierFailure;
      };
      const insertAppointment = async () => {
        try {
          await appointmentClient.query("begin");
          await appointmentClient.query(
            `insert into appointments
              (schedule_entry_id, client_id, service_name_snapshot, duration_minutes_snapshot, price_cents_snapshot)
             values ($1, $2, 'Test service', 60, 1000)`,
            [entryId, clientId],
          );
          await waitForBothInserts();
          await appointmentClient.query("commit");
          return "appointment";
        } catch (error) {
          releaseBarrier?.(error);
          try {
            await appointmentClient.query("rollback");
          } catch {
            // Preserve the original database/barrier failure.
          }
          throw error;
        } finally {
          appointmentClient.release();
        }
      };
      const insertBlock = async () => {
        try {
          await blockClient.query("begin");
          await blockClient.query(
            `insert into schedule_blocks (schedule_entry_id, reason)
             values ($1, 'Concurrent test block')`,
            [entryId],
          );
          await waitForBothInserts();
          await blockClient.query("commit");
          return "block";
        } catch (error) {
          releaseBarrier?.(error);
          try {
            await blockClient.query("rollback");
          } catch {
            // Preserve the original database/barrier failure.
          }
          throw error;
        } finally {
          blockClient.release();
        }
      };

      const results = await Promise.allSettled([insertAppointment(), insertBlock()]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
      const rejected = results.find((result) => result.status === "rejected");
      if (rejected?.status !== "rejected") throw new Error("expected one rejected transaction");
      expect(rejected.reason.code).toBe("23514");

      const detailCount = await pool.query(
        `select
           (select count(*) from appointments where schedule_entry_id = $1)
           + (select count(*) from schedule_blocks where schedule_entry_id = $1) as count`,
        [entryId],
      );
      expect(Number(detailCount.rows[0].count)).toBe(1);
    } finally {
      await stopTestDatabase(testDatabase);
    }
  });

  it("rejects a move that would orphan the old schedule entry", async () => {
    const testDatabase = await startTestDatabase();
    try {
      const { connectionString, pool } = testDatabase;
      const { runMigrations } = await import("./migrate.js");
      await runMigrations(connectionString);

      const employee = await pool.query(
        `insert into users (name, email_normalized, role)
         values ('Move Employee', 'move-employee@example.com', 'EMPLOYEE') returning id`,
      );
      const client = await pool.query(
        `insert into users (name, email_normalized, role)
         values ('Move Client', 'move-client@example.com', 'CLIENT') returning id`,
      );
      const employeeId = employee.rows[0].id;
      const clientId = client.rows[0].id;
      const employeeDetail = await pool.query(
        `insert into employees (user_id, display_name, specialty_summary)
         values ($1, 'Move Employee', 'Test')
         returning id`,
        [employeeId],
      );
      const employeeDetailId = employeeDetail.rows[0].id;
      const setupClient = await pool.connect();
      try {
        // First transaction: create two complete, valid appointment entries.
        await setupClient.query("begin");
        const entries = await setupClient.query(
          `insert into schedule_entries (employee_id, starts_at, ends_at, kind)
           values
             ($1, '2030-01-02T13:00:00Z', '2030-01-02T14:00:00Z', 'APPOINTMENT'),
             ($1, '2030-01-02T15:00:00Z', '2030-01-02T16:00:00Z', 'APPOINTMENT')
           returning id, starts_at`,
          [employeeDetailId],
        );
        const orderedEntries = entries.rows.toSorted(
          /** @param {any} left @param {any} right */ (left, right) =>
          left.starts_at.getTime() - right.starts_at.getTime(),
        );
        const oldEntryId = orderedEntries[0].id;
        const newEntryId = orderedEntries[1].id;
        await setupClient.query(
          `insert into appointments
            (schedule_entry_id, client_id, service_name_snapshot, duration_minutes_snapshot, price_cents_snapshot)
           values
             ($1, $2, 'Move service A', 60, 1000),
             ($3, $2, 'Move service B', 60, 1000)`,
          [oldEntryId, clientId, newEntryId],
        );
        await setupClient.query("commit");

        // Second transaction: delete B, then move A to B. The old trigger
        // checked only B and could commit with A orphaned; both IDs must be
        // validated by the corrected trigger before this commit succeeds.
        await setupClient.query("begin");
        await setupClient.query(
          `delete from appointments where schedule_entry_id = $1`,
          [newEntryId],
        );
        await setupClient.query(
          `update appointments set schedule_entry_id = $1 where schedule_entry_id = $2`,
          [newEntryId, oldEntryId],
        );
        await expect(setupClient.query("commit")).rejects.toMatchObject({ code: "23514" });
        await setupClient.query("rollback");
      } catch (error) {
        await setupClient.query("rollback");
        throw error;
      } finally {
        setupClient.release();
      }
    } finally {
      await stopTestDatabase(testDatabase);
    }
  });
});
