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
      await pool.query(
        `insert into employees (user_id, display_name, specialty_summary)
         values ($1, 'Test Employee', 'Test')`,
        [employeeId],
      );

      // The fixture is intentionally bare so both transactions can race to
      // provide the one required detail row.
      await pool.query(`alter table schedule_entries disable trigger user`);
      const entry = await pool.query(
        `insert into schedule_entries (employee_id, starts_at, ends_at, kind)
         values ($1, '2030-01-01T13:00:00Z', '2030-01-01T14:00:00Z', 'APPOINTMENT')
         returning id`,
        [employeeId],
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
      await pool.query(
        `insert into employees (user_id, display_name, specialty_summary) values ($1, 'Move Employee', 'Test')`,
        [employeeId],
      );
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
          [employeeId],
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
