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

async function rollbackQuietly(client) {
  try {
    await client.query("rollback");
  } catch {
    // Preserve the original assertion/database error during cleanup.
  }
}

async function readRenewals(pool, listCancellationCreditRenewals, clientId) {
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query("begin");
    transactionOpen = true;
    const result = await listCancellationCreditRenewals(client, { clientId });
    await client.query("commit");
    transactionOpen = false;
    return result;
  } finally {
    if (transactionOpen) await rollbackQuietly(client);
    client.release();
  }
}

function withBarrier(timeoutMs = 5_000) {
  let ready = 0;
  let settled = false;
  let failure;
  let resolveOpened;
  let timeout;
  const opened = new Promise((resolve) => {
    resolveOpened = resolve;
  });
  const finish = (error = null) => {
    if (settled) return;
    settled = true;
    failure = error;
    clearTimeout(timeout);
    resolveOpened();
  };
  timeout = setTimeout(
    () => finish(new Error("Concurrent credit barrier timed out")),
    timeoutMs,
  );
  return {
    wait: async () => {
      if (settled && failure) throw failure;
      ready += 1;
      if (ready === 2) finish();
      await opened;
      if (failure) throw failure;
    },
    abort: (error) => finish(error),
  };
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
      let transactionOpen = false;
      try {
        for (let slot = 0; slot < 3; slot += 1) {
          const usedAt = new Date(now.getTime() + slot * 24 * 60 * 60 * 1000);
          await transaction.query("begin");
          transactionOpen = true;
          const result = await claimCancellationCredit(transaction, {
            clientId,
            appointmentId: null,
            now: usedAt,
          });
          expect(result.ok).toBe(true);
          claimed.push(result.slotNumber);
          await transaction.query("commit");
          transactionOpen = false;
        }

        await transaction.query("begin");
        transactionOpen = true;
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
        transactionOpen = false;
      } finally {
        if (transactionOpen) await rollbackQuietly(transaction);
        transaction.release();
      }
      expect(claimed.toSorted()).toEqual([1, 2, 3]);

      const firstRenewal = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const beforeBoundary = new Date(firstRenewal.getTime() - 1);
      const boundaryClient = await pool.connect();
      let boundaryTransactionOpen = false;
      try {
        await boundaryClient.query("begin");
        boundaryTransactionOpen = true;
        const tooEarly = await claimCancellationCredit(boundaryClient, {
          clientId,
          appointmentId: null,
          now: beforeBoundary,
        });
        expect(tooEarly.ok).toBe(false);
        await boundaryClient.query("rollback");
        boundaryTransactionOpen = false;

        await boundaryClient.query("begin");
        boundaryTransactionOpen = true;
        const exact = await claimCancellationCredit(boundaryClient, {
          clientId,
          appointmentId: null,
          now: firstRenewal,
        });
        expect(exact.ok).toBe(true);
        await boundaryClient.query("commit");
        boundaryTransactionOpen = false;
      } finally {
        if (boundaryTransactionOpen) await rollbackQuietly(boundaryClient);
        boundaryClient.release();
      }
      const renewals = await readRenewals(pool, listCancellationCreditRenewals, clientId);
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
        const barrier = withBarrier();
        const claim = async (connection) => {
          let transactionOpen = false;
          let barrierReached = false;
          try {
            await connection.query("begin");
            transactionOpen = true;
            barrierReached = true;
            await barrier.wait();
            const result = await claimCancellationCredit(connection, {
              clientId,
              appointmentId: null,
              now: new Date("2040-02-01T00:00:00Z"),
            });
            await connection.query(result.ok ? "commit" : "rollback");
            transactionOpen = false;
            return result;
          } catch (error) {
            if (!barrierReached) barrier.abort(error);
            throw error;
          } finally {
            if (transactionOpen) await rollbackQuietly(connection);
            connection.release();
          }
        };
        const results = await Promise.all([claim(left), claim(right)]);
        barrier.abort(new Error("Concurrent credit participants finished"));
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
        let transactionOpen = false;
        try {
          await client.query("begin");
          transactionOpen = true;
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
          transactionOpen = false;
          return appointment.rows[0].id;
        } finally {
          if (transactionOpen) await rollbackQuietly(client);
          client.release();
        }
      };
      for (const [role, actorId, suffix] of [
        ["EMPLOYEE", employeeUser.rows[0].id, 8],
        ["ADMIN", (await pool.query(`insert into users (name, email_normalized, role) values ('Credit Test Admin', 'credit-admin@example.test', 'ADMIN') returning id`)).rows[0].id, 10],
      ]) {
        const appointmentId = await createAppointment(suffix);
        const client = await pool.connect();
        let transactionOpen = false;
        try {
          await client.query("begin");
          transactionOpen = true;
          const result = await cancelScheduleEntry(client, {
            appointmentId,
            actorId,
            actorRole: role,
            now: new Date("2040-04-01T07:00:00.000Z"),
          });
          expect(result.ok).toBe(true);
          expect(result.credit).toBeNull();
          await client.query("commit");
          transactionOpen = false;
        } finally {
          if (transactionOpen) await rollbackQuietly(client);
          client.release();
        }
      }
      const renewals = await readRenewals(pool, listCancellationCreditRenewals, clientId);
      expect(renewals).toHaveLength(3);
      expect(renewals.every((value) => value <= new Date("2040-04-01T07:00:00.000Z"))).toBe(true);
    } finally {
      await stopTestDatabase(database);
    }
  });

  it("rejects suspended, deleted, and inactive actors without changing appointments or credits", async () => {
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
      const clientId = await seedClient(pool, "inactive-actors");
      const employeeUser = await pool.query(
        `insert into users (name, email_normalized, role)
         values ('Status Test Employee', 'status-employee@example.test', 'EMPLOYEE') returning id`,
      );
      const employee = await pool.query(
        `insert into employees (user_id, display_name, specialty_summary)
         values ($1, 'Status Test Employee', 'Test') returning id`,
        [employeeUser.rows[0].id],
      );
      const admin = await pool.query(
        `insert into users (name, email_normalized, role)
         values ('Status Test Admin', 'status-admin@example.test', 'ADMIN') returning id`,
      );
      const createAppointment = async (hour) => {
        const client = await pool.connect();
        let transactionOpen = false;
        try {
          await client.query("begin");
          transactionOpen = true;
          const entry = await insertActiveScheduleEntry(client, {
            employeeId: employee.rows[0].id,
            startsAt: `2040-05-01T${hour}:00:00.000Z`,
            endsAt: `2040-05-01T${Number(hour) + 1}:00:00.000Z`,
            kind: "APPOINTMENT",
          });
          const appointment = await client.query(
            `insert into appointments
              (schedule_entry_id, client_id, service_name_snapshot,
               duration_minutes_snapshot, price_cents_snapshot)
             values ($1, $2, 'Status Test Service', 60, 1000) returning id`,
            [entry.id, clientId],
          );
          await client.query("commit");
          transactionOpen = false;
          return appointment.rows[0].id;
        } finally {
          if (transactionOpen) await rollbackQuietly(client);
          client.release();
        }
      };
      const attemptCancel = async (appointmentId, actorId, actorRole) => {
        const client = await pool.connect();
        let transactionOpen = false;
        try {
          await client.query("begin");
          transactionOpen = true;
          const result = await cancelScheduleEntry(client, {
            appointmentId,
            actorId,
            actorRole,
            now: new Date("2040-05-01T07:00:00.000Z"),
          });
          await client.query("commit");
          transactionOpen = false;
          return result;
        } finally {
          if (transactionOpen) await rollbackQuietly(client);
          client.release();
        }
      };

      await pool.query(`update users set status = 'SUSPENDED' where id = $1`, [clientId]);
      const suspendedClientAppointment = await createAppointment("08");
      await expect(attemptCancel(suspendedClientAppointment, clientId, "CLIENT"))
        .resolves.toMatchObject({ ok: false, code: "FORBIDDEN" });

      await pool.query(`update users set status = 'DELETED' where id = $1`, [admin.rows[0].id]);
      const deletedAdminAppointment = await createAppointment("10");
      await expect(attemptCancel(deletedAdminAppointment, admin.rows[0].id, "ADMIN"))
        .resolves.toMatchObject({ ok: false, code: "FORBIDDEN" });

      await pool.query(`update employees set status = 'INACTIVE' where id = $1`, [employee.rows[0].id]);
      const inactiveEmployeeAppointment = await createAppointment("12");
      await expect(attemptCancel(inactiveEmployeeAppointment, employeeUser.rows[0].id, "EMPLOYEE"))
        .resolves.toMatchObject({ ok: false, code: "FORBIDDEN" });

      const appointments = await pool.query(
        `select status from appointments where id = any($1::uuid[]) order by id`,
        [[suspendedClientAppointment, deletedAdminAppointment, inactiveEmployeeAppointment]],
      );
      expect(appointments.rows.every((row) => row.status === "CONFIRMED")).toBe(true);
      const renewals = await readRenewals(pool, listCancellationCreditRenewals, clientId);
      expect(renewals).toHaveLength(3);
      expect(renewals.every((value) => value <= new Date("2040-05-01T07:00:00.000Z"))).toBe(true);
    } finally {
      await stopTestDatabase(database);
    }
  });
});
