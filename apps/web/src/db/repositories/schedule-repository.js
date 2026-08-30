// @ts-nocheck
import "server-only";

import { sql as drizzleSql } from "drizzle-orm";
import { claimCancellationCredit } from "./cancellation-credit-repository.js";

function rowsOf(result) {
  return result?.rows ?? result ?? [];
}

async function query(transaction, text, values = []) {
  if (typeof transaction?.query === "function") {
    const result = await transaction.query(text, values);
    return rowsOf(result);
  }
  if (typeof transaction?.execute === "function") {
    const fragments = text.split(/\$(\d+)/u);
    let statement = drizzleSql.raw(fragments[0]);
    for (let index = 1; index < fragments.length; index += 2) {
      statement = drizzleSql`${statement}${values[Number(fragments[index]) - 1]}${drizzleSql.raw(fragments[index + 1])}`;
    }
    return rowsOf(await transaction.execute(statement));
  }
  throw new TypeError("A transaction-bound PostgreSQL client is required");
}

function slotUnavailableError() {
  const error = new Error("The requested schedule interval is unavailable");
  error.code = "SLOT_UNAVAILABLE";
  return error;
}

/**
 * Insert one active collision-surface row. Exclusion violations are exposed
 * as the stable domain code; every other database error is propagated intact.
 */
export async function insertActiveScheduleEntry(
  transaction,
  { employeeId, startsAt, endsAt, kind, createdBy = null },
) {
  try {
    const [entry] = await query(
      transaction,
      `insert into schedule_entries
        (employee_id, starts_at, ends_at, kind, status, created_by)
       values ($1, $2, $3, $4, 'ACTIVE', $5)
       returning id, employee_id, starts_at, ends_at, kind, status`,
      [employeeId, startsAt, endsAt, kind, createdBy],
    );
    return entry;
  } catch (error) {
    if (error?.code === "23P01" && error?.constraint === "schedule_entries_no_employee_overlap") {
      throw slotUnavailableError();
    }
    throw error;
  }
}

/**
 * Cancel an appointment and its collision row within the caller's
 * transaction. Client cancellation claims one credit; employee and admin
 * cancellation intentionally do not. Authorization is checked against the
 * persisted actor role and ownership, not just caller-provided labels.
 */
export async function cancelScheduleEntry(
  transaction,
  { appointmentId, actorId, actorRole, reason = null, now = new Date() },
) {
  const [appointment] = await query(
    transaction,
    `select a.id, a.schedule_entry_id, a.client_id, se.employee_id
       from appointments a
       join schedule_entries se on se.id = a.schedule_entry_id
      where a.id = $1
        and a.status = 'CONFIRMED'
        and se.status = 'ACTIVE'
      for update`,
    [appointmentId],
  );
  if (!appointment) {
    return { ok: false, code: "APPOINTMENT_NOT_FOUND", data: {} };
  }

  const [actor] = await query(
    transaction,
    `select u.role,
            exists (
              select 1 from employees e
               where e.user_id = u.id and e.id = $2
            ) as is_assigned_employee
       from users u
      where u.id = $1`,
    [actorId, appointment.employee_id],
  );
  const persistedRole = actor?.role;
  const roleMatches = persistedRole === actorRole;
  const authorized = roleMatches && (
    (actorRole === "CLIENT" && actorId === appointment.client_id)
    || (actorRole === "EMPLOYEE" && actor.is_assigned_employee)
    || actorRole === "ADMIN"
  );
  if (!authorized) {
    return { ok: false, code: "FORBIDDEN", data: {} };
  }

  let credit = null;
  if (actorRole === "CLIENT") {
    const claim = await claimCancellationCredit(transaction, {
      clientId: appointment.client_id,
      appointmentId: appointment.id,
      now,
    });
    if (!claim.ok) {
      return { ...claim, data: {} };
    }
    credit = {
      id: claim.creditId,
      slotNumber: claim.slotNumber,
      availableAt: claim.availableAt,
    };
  }

  await query(
    transaction,
    `update appointments
        set status = 'CANCELLED',
            cancellation_reason = $2,
            cancelled_at = $3,
            cancelled_by = $4,
            updated_at = $3
      where id = $1`,
    [appointment.id, reason, now, actorId],
  );
  await query(
    transaction,
    `update schedule_entries
        set status = 'CANCELLED', updated_at = $2
      where id = $1`,
    [appointment.schedule_entry_id, now],
  );
  return {
    ok: true,
    code: "SCHEDULE_ENTRY_CANCELLED",
    appointmentId: appointment.id,
    scheduleEntryId: appointment.schedule_entry_id,
    credit,
  };
}
