// @ts-nocheck
import { describe, expect, it } from "vitest";
import { startTestDatabase, stopTestDatabase } from "./test-database.js";

async function seedClient(pool, suffix) {
  const result = await pool.query(
    `insert into users (name, email_normalized, role)
     values ('Credit Test Client', $1, 'CLIENT') returning id`,
    [`credit-${suffix}@example.test`],
  );
  const clientId = result.rows[0].id;
  await pool.query(
    `insert into cancellation_credits (client_id, slot_number)
     select $1, number from generate_series(1, 3) as numbers(number)`,
    [clientId],
  );
  return clientId;
}

describe("real PostgreSQL cancellation credits", () => {
  it("locks distinct credits, exposes three renewal instants, and honors the 30-day boundary", async () => {
    const database = await startTestDatabase();
    try {
      const {
        claimCancellationCredit,
        listCancellationCreditRenewals,
      } = await import("./repositories/cancellation-credit-repository.js");
      const { runMigrations } = await import("./migrate.js");
      await runMigrations(database.connectionString);
      const { pool } = database;
      const now = new Date("2040-02-01T12:00:00.000Z");
      const clientId = await seedClient(pool, "three");
      const claimed = [];
      const transaction = await pool.connect();
      try {
        for (let slot = 0; slot < 3; slot += 1) {
          const usedAt = new Date(now.getTime() + slot * 24 * 60 * 60 * 1000);
          await transaction.query("begin");
          const result = await claimCancellationCredit(transaction, {
            clientId,
            appointmentId: null,
            now: usedAt,
          });
          expect(result.ok).toBe(true);
          claimed.push(result.slotNumber);
          await transaction.query("commit");
        }

        await transaction.query("begin");
        const fourth = await claimCancellationCredit(transaction, {
          clientId,
          appointmentId: null,
          now: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
        });
        expect(fourth).toMatchObject({
          ok: false,
          code: "NO_CANCELLATION_CREDIT",
        });
        expect(fourth.renewalInstants).toHaveLength(3);
        expect(fourth.renewalInstants.every((value) => value instanceof Date)).toBe(true);
        expect(fourth.renewalInstants).toEqual([
          new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000),
          new Date(now.getTime() + 32 * 24 * 60 * 60 * 1000),
        ]);
        await transaction.query("rollback");
      } finally {
        transaction.release();
      }
      expect(claimed.toSorted()).toEqual([1, 2, 3]);

      const firstRenewal = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const beforeBoundary = new Date(firstRenewal.getTime() - 1);
      const boundaryClient = await pool.connect();
      try {
        await boundaryClient.query("begin");
        const tooEarly = await claimCancellationCredit(boundaryClient, {
          clientId,
          appointmentId: null,
          now: beforeBoundary,
        });
        expect(tooEarly.ok).toBe(false);
        await boundaryClient.query("rollback");

        await boundaryClient.query("begin");
        const exact = await claimCancellationCredit(boundaryClient, {
          clientId,
          appointmentId: null,
          now: firstRenewal,
        });
        expect(exact.ok).toBe(true);
        await boundaryClient.query("commit");
      } finally {
        boundaryClient.release();
      }
      const renewals = await listCancellationCreditRenewals(pool, { clientId });
      expect(renewals).toHaveLength(3);
    } finally {
      await stopTestDatabase(database);
    }
  });

  it("prevents duplicate credit consumption under ten concurrent claim races", async () => {
    const database = await startTestDatabase();
    try {
      const { claimCancellationCredit } = await import("./repositories/cancellation-credit-repository.js");
      const { runMigrations } = await import("./migrate.js");
      await runMigrations(database.connectionString);
      const { pool } = database;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const clientId = await seedClient(pool, `race-${attempt}`);
        await pool.query(
          `update cancellation_credits set available_at = '2040-03-01T00:00:00Z'
           where client_id = $1 and slot_number > 1`,
          [clientId],
        );
        const left = await pool.connect();
        const right = await pool.connect();
        let ready = 0;
        let release;
        const barrier = new Promise((resolve) => {
          release = resolve;
        });
        const claim = async (connection) => {
          try {
            await connection.query("begin");
            ready += 1;
            if (ready === 2) release();
            await barrier;
            const result = await claimCancellationCredit(connection, {
              clientId,
              appointmentId: null,
              now: new Date("2040-02-01T00:00:00Z"),
            });
            await connection.query(result.ok ? "commit" : "rollback");
            return result;
          } finally {
            connection.release();
          }
        };
        const results = await Promise.all([claim(left), claim(right)]);
        expect(results.filter((result) => result.ok)).toHaveLength(1);
        expect(results.filter((result) => result.code === "NO_CANCELLATION_CREDIT")).toHaveLength(1);
      }
    } finally {
      await stopTestDatabase(database);
    }
  });

  it("does not consume a client credit for employee or administrator cancellation", async () => {
    const database = await startTestDatabase();
    try {
      const { listCancellationCreditRenewals } = await import("./repositories/cancellation-credit-repository.js");
      const {
        cancelScheduleEntry,
        insertActiveScheduleEntry,
      } = await import("./repositories/schedule-repository.js");
      const { runMigrations } = await import("./migrate.js");
      await runMigrations(database.connectionString);
      const { pool } = database;
      const clientId = await seedClient(pool, "authority");
      const employeeUser = await pool.query(
        `insert into users (name, email_normalized, role)
         values ('Credit Test Employee', 'credit-employee@example.test', 'EMPLOYEE') returning id`,
      );
      const employee = await pool.query(
        `insert into employees (user_id, display_name, specialty_summary)
         values ($1, 'Credit Test Employee', 'Test') returning id`,
        [employeeUser.rows[0].id],
      );
      const service = await pool.query(
        `insert into services (name, duration_minutes, price_cents)
         values ('Credit Test Service', 60, 1000) returning id`,
      );
      const createAppointment = async (suffix) => {
        const client = await pool.connect();
        try {
          await client.query("begin");
          const entry = await insertActiveScheduleEntry(client, {
            employeeId: employee.rows[0].id,
            startsAt: `2040-04-01T${suffix}:00.000Z`,
            endsAt: `2040-04-01T${Number(suffix) + 1}:00.000Z`,
            kind: "APPOINTMENT",
          });
          const appointment = await client.query(
            `insert into appointments
              (schedule_entry_id, client_id, service_id, service_name_snapshot,
               duration_minutes_snapshot, price_cents_snapshot)
             values ($1, $2, $3, 'Credit Test Service', 60, 1000) returning id`,
            [entry.id, clientId, service.rows[0].id],
          );
          await client.query("commit");
          return appointment.rows[0].id;
        } finally {
          client.release();
        }
      };
      for (const [role, actorId, suffix] of [
        ["EMPLOYEE", employeeUser.rows[0].id, 8],
        ["ADMIN", (await pool.query(`insert into users (name, email_normalized, role) values ('Credit Test Admin', 'credit-admin@example.test', 'ADMIN') returning id`)).rows[0].id, 10],
      ]) {
        const appointmentId = await createAppointment(suffix);
        const client = await pool.connect();
        try {
          await client.query("begin");
          const result = await cancelScheduleEntry(client, {
            appointmentId,
            actorId,
            actorRole: role,
            now: new Date("2040-04-01T07:00:00.000Z"),
          });
          expect(result.ok).toBe(true);
          expect(result.credit).toBeNull();
          await client.query("commit");
        } finally {
          client.release();
        }
      }
      const renewals = await listCancellationCreditRenewals(pool, { clientId });
      expect(renewals).toHaveLength(3);
      expect(renewals.every((value) => value <= new Date("2040-04-01T07:00:00.000Z"))).toBe(true);
    } finally {
      await stopTestDatabase(database);
    }
  });
});
