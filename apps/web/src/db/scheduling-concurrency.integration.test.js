// @ts-nocheck
import { describe, expect, it } from "vitest";
import { startTestDatabase, stopTestDatabase } from "./test-database.js";

async function seedPeople(pool, suffix) {
  const employeeUser = await pool.query(
    `insert into users (name, email_normalized, role)
     values ('Concurrency Employee', $1, 'EMPLOYEE') returning id`,
    [`employee-${suffix}@example.test`],
  );
  const clientUser = await pool.query(
    `insert into users (name, email_normalized, role)
     values ('Concurrency Client', $1, 'CLIENT') returning id`,
    [`client-${suffix}@example.test`],
  );
  const employee = await pool.query(
    `insert into employees (user_id, display_name, specialty_summary)
     values ($1, 'Concurrency Employee', 'Test') returning id`,
    [employeeUser.rows[0].id],
  );
  await pool.query(
    `insert into cancellation_credits (client_id, slot_number)
     select $1, number from generate_series(1, 3) as numbers(number)`,
    [clientUser.rows[0].id],
  );
  return {
    employeeId: employee.rows[0].id,
    employeeUserId: employeeUser.rows[0].id,
    clientId: clientUser.rows[0].id,
  };
}

async function insertAppointmentDetail(client, entry, clientId) {
  await client.query(
    `insert into appointments
      (schedule_entry_id, client_id, service_name_snapshot,
       duration_minutes_snapshot, price_cents_snapshot)
     values ($1, $2, 'Test service', 60, 1000)`,
    [entry.id, clientId],
  );
}

async function insertBlockDetail(client, entry) {
  await client.query(
    `insert into schedule_blocks (schedule_entry_id, reason)
     values ($1, 'Administrative test block')`,
    [entry.id],
  );
}

async function withBarrier() {
  let ready = 0;
  let release;
  const opened = new Promise((resolve) => {
    release = resolve;
  });
  return async () => {
    ready += 1;
    if (ready === 2) release();
    await opened;
  };
}

async function rollbackQuietly(client) {
  try {
    await client.query("rollback");
  } catch {
    // Preserve the original assertion/database error during cleanup.
  }
}

async function runConcurrent(pool, operation) {
  const left = await pool.connect();
  const right = await pool.connect();
  const barrier = await withBarrier();
  const run = async (client, index) => {
    let transactionOpen = false;
    try {
      await client.query("begin");
      transactionOpen = true;
      await barrier();
      const result = await operation(client, index);
      transactionOpen = false;
      return result;
    } finally {
      if (transactionOpen) await rollbackQuietly(client);
      client.release();
    }
  };
  return Promise.allSettled([run(left, 0), run(right, 1)]);
}

describe("real PostgreSQL scheduling concurrency", () => {
  it("preserves half-open interval and cancellation invariants across repeated races", async () => {
    const database = await startTestDatabase();
    try {
      const {
        cancelScheduleEntry,
        insertActiveScheduleEntry,
      } = await import("./repositories/schedule-repository.js");
      const { runMigrations } = await import("./migrate.js");
      await runMigrations(database.connectionString);
      const { pool } = database;

      for (let attempt = 0; attempt < 10; attempt += 1) {
        const people = await seedPeople(pool, `same-${attempt}`);
        const identical = await runConcurrent(pool, async (client) => {
          const entry = await insertActiveScheduleEntry(client, {
            employeeId: people.employeeId,
            startsAt: "2040-01-01T10:00:00.000Z",
            endsAt: "2040-01-01T11:00:00.000Z",
            kind: "APPOINTMENT",
          });
          await insertAppointmentDetail(client, entry, people.clientId);
          await client.query("commit");
          return entry.id;
        });
        expect(identical.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        const rejected = identical.find((result) => result.status === "rejected");
        expect(rejected?.reason).toMatchObject({ code: "SLOT_UNAVAILABLE" });

        const partial = await runConcurrent(pool, async (client, index) => {
          const entry = await insertActiveScheduleEntry(client, {
            employeeId: people.employeeId,
            startsAt: index === 0 ? "2040-01-01T12:00:00.000Z" : "2040-01-01T12:30:00.000Z",
            endsAt: index === 0 ? "2040-01-01T13:00:00.000Z" : "2040-01-01T13:30:00.000Z",
            kind: "APPOINTMENT",
          });
          await insertAppointmentDetail(client, entry, people.clientId);
          await client.query("commit");
          return entry.id;
        });
        expect(partial.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        const partialErrors = partial.filter((result) => result.status === "rejected");
        expect(partialErrors).toHaveLength(1);
        expect(partialErrors[0].reason).toMatchObject({ code: "SLOT_UNAVAILABLE" });

        const touching = await runConcurrent(pool, async (client, index) => {
          const isSecond = index === 1;
          const entry = await insertActiveScheduleEntry(client, {
            employeeId: people.employeeId,
            startsAt: isSecond ? "2040-01-01T15:00:00.000Z" : "2040-01-01T14:00:00.000Z",
            endsAt: isSecond ? "2040-01-01T16:00:00.000Z" : "2040-01-01T15:00:00.000Z",
            kind: "APPOINTMENT",
          });
          await insertAppointmentDetail(client, entry, people.clientId);
          await client.query("commit");
          return entry.id;
        });
        expect(touching.filter((result) => result.status === "fulfilled")).toHaveLength(2);

        const otherEmployees = [
          await seedPeople(pool, `other-a-${attempt}`),
          await seedPeople(pool, `other-b-${attempt}`),
        ];
        const differentEmployee = await runConcurrent(pool, async (client, index) => {
          const otherEmployee = otherEmployees[index];
          const entry = await insertActiveScheduleEntry(client, {
            employeeId: otherEmployee.employeeId,
            startsAt: "2040-01-01T10:00:00.000Z",
            endsAt: "2040-01-01T11:00:00.000Z",
            kind: "APPOINTMENT",
          });
          await insertAppointmentDetail(client, entry, otherEmployee.clientId);
          await client.query("commit");
          return entry.id;
        });
        expect(differentEmployee.filter((result) => result.status === "fulfilled")).toHaveLength(2);

        const block = await runConcurrent(pool, async (client, index) => {
          const kind = index === 0 ? "APPOINTMENT" : "BLOCK";
          const entry = await insertActiveScheduleEntry(client, {
            employeeId: people.employeeId,
            startsAt: "2040-01-01T17:00:00.000Z",
            endsAt: "2040-01-01T18:00:00.000Z",
            kind,
          });
          if (kind === "BLOCK") {
            await insertBlockDetail(client, entry);
          } else {
            await insertAppointmentDetail(client, entry, people.clientId);
          }
          await client.query("commit");
          return entry.id;
        });
        expect(block.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        expect(block.filter((result) => result.status === "rejected")).toHaveLength(1);
        expect(block.some((result) => result.status === "rejected" && result.reason.code === "SLOT_UNAVAILABLE")).toBe(true);

        const cancelClient = await pool.connect();
        let transactionOpen = false;
        try {
          await cancelClient.query("begin");
          transactionOpen = true;
          const entry = await insertActiveScheduleEntry(cancelClient, {
            employeeId: people.employeeId,
            startsAt: "2040-01-01T19:00:00.000Z",
            endsAt: "2040-01-01T20:00:00.000Z",
            kind: "APPOINTMENT",
          });
          await insertAppointmentDetail(cancelClient, entry, people.clientId);
          await cancelClient.query("commit");

          await cancelClient.query("begin");
          const appointment = await cancelClient.query(
            `select id from appointments where schedule_entry_id = $1`,
            [entry.id],
          );
          const cancelled = await cancelScheduleEntry(cancelClient, {
            appointmentId: appointment.rows[0].id,
            actorId: people.clientId,
            actorRole: "CLIENT",
            now: new Date("2040-01-01T09:00:00.000Z"),
          });
          expect(cancelled.ok).toBe(true);
          await cancelClient.query("commit");
          transactionOpen = false;

          await cancelClient.query("begin");
          transactionOpen = true;
          const reused = await insertActiveScheduleEntry(cancelClient, {
            employeeId: people.employeeId,
            startsAt: "2040-01-01T19:00:00.000Z",
            endsAt: "2040-01-01T20:00:00.000Z",
            kind: "APPOINTMENT",
          });
          await insertAppointmentDetail(cancelClient, reused, people.clientId);
          await cancelClient.query("commit");
          transactionOpen = false;
        } finally {
          if (transactionOpen) await rollbackQuietly(cancelClient);
          cancelClient.release();
        }
      }
    } finally {
      await stopTestDatabase(database);
    }
  });
});
