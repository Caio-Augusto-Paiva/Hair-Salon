// @ts-nocheck
import "server-only";

import { sql as drizzleSql } from "drizzle-orm";

function rowsOf(result) {
  return result?.rows ?? result ?? [];
}

function assertTransaction(transaction) {
  if (typeof transaction?.query === "function" && typeof transaction?.connect === "function") {
    throw new TypeError("A transaction-bound client is required; pg Pool cannot be used");
  }
  if (
    !(
      typeof transaction?.execute === "function"
      || (typeof transaction?.query === "function" && typeof transaction?.release === "function")
    )
  ) {
    throw new TypeError("A transaction-bound PostgreSQL client is required");
  }
}

/**
 * Execute a parameterized statement against either a node-postgres client or
 * a Drizzle PostgreSQL transaction. The caller owns the transaction boundary.
 */
async function query(transaction, text, values = []) {
  assertTransaction(transaction);
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

/**
 * Return the renewal instants in slot order. This deliberately returns only
 * timestamps, never appointment, client, or employee records.
 *
 * @param {object} transaction
 * @param {{clientId: string}} input
 * @returns {Promise<Date[]>}
 */
export async function listCancellationCreditRenewals(transaction, { clientId }) {
  const rows = await query(
    transaction,
    `select available_at
       from cancellation_credits
      where client_id = $1
      order by slot_number`,
    [clientId],
  );
  return rows.map((row) => new Date(row.available_at));
}

/**
 * Atomically claim the first eligible cancellation credit. The caller must
 * commit or roll back the transaction; this function never starts a nested
 * transaction. PostgreSQL row locking prevents two callers from claiming the
 * same slot, and the renewal is calculated by PostgreSQL for exact interval
 * semantics.
 *
 * @param {object} transaction
 * @param {{clientId: string, appointmentId?: string|null, now?: Date}} input
 */
export async function claimCancellationCredit(
  transaction,
  { clientId, appointmentId = null, now = new Date() },
) {
  const eligible = await query(
    transaction,
    `select id, slot_number
       from cancellation_credits
      where client_id = $1
        and available_at <= $2
      order by slot_number
      for update`,
    [clientId, now],
  );

  if (eligible.length === 0) {
    return {
      ok: false,
      code: "NO_CANCELLATION_CREDIT",
      renewalInstants: await listCancellationCreditRenewals(transaction, { clientId }),
    };
  }

  const [updated] = await query(
    transaction,
    `update cancellation_credits
        set available_at = $2::timestamptz + interval '30 days',
            last_appointment_id = $3,
            last_used_at = $2,
            updated_at = $2
      where id = $1
      returning id, slot_number, available_at, last_used_at`,
    [eligible[0].id, now, appointmentId],
  );

  return {
    ok: true,
    code: "CANCELLATION_CREDIT_CLAIMED",
    creditId: updated.id,
    slotNumber: updated.slot_number,
    availableAt: new Date(updated.available_at),
    lastUsedAt: new Date(updated.last_used_at),
  };
}
