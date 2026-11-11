import "server-only";

import { randomBytes } from "node:crypto";
import { normalizeEmail } from "./contracts.js";
import { hashPassword, verifyPassword } from "./password.js";

const DUMMY_PASSWORD = randomBytes(32).toString("base64url");
const dummyPasswordHashReady = hashPassword(DUMMY_PASSWORD);

class AccountRepositoryError extends Error {
  /** @param {string} code */
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/** @param {Record<string, any>} row */
function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    emailNormalized: row.email_normalized,
    role: row.role,
    status: row.status,
    sessionVersion: row.session_version,
  };
}

/** @param {any} error */
function isNamedEmailDuplicate(error) {
  return error?.code === "23505" && error?.constraint === "users_email_normalized_unique";
}

function duplicateEmailError() {
  return new AccountRepositoryError("EMAIL_ALREADY_EXISTS");
}

/** @param {any} pool */
function assertPool(pool) {
  if (typeof pool?.connect !== "function") {
    throw new TypeError("A pg Pool with connect() is required");
  }
}

/** @param {any} pool @param {(client: any) => Promise<any>} operation */
async function inTransaction(pool, operation) {
  assertPool(pool);
  const client = await pool.connect();
  let transactionOpen = false;
  let result;
  let primaryError = null;
  let rollbackError = null;
  try {
    await client.query("begin");
    transactionOpen = true;
    result = await operation(client);
    await client.query("commit");
    transactionOpen = false;
  } catch (error) {
    primaryError = error;
    if (transactionOpen) {
      try {
        await client.query("rollback");
      } catch (errorDuringRollback) {
        rollbackError = errorDuringRollback;
      }
    }
  }
  let releaseError = null;
  try {
    if (rollbackError) {
      await client.release(rollbackError);
    } else {
      await client.release();
    }
  } catch (errorDuringRelease) {
    releaseError = errorDuringRelease;
  }
  if (primaryError) throw primaryError;
  if (releaseError) throw releaseError;
  return result;
}

/** @param {any} client @param {string} clientId */
async function insertCancellationCredits(client, clientId) {
  await client.query(
    `insert into cancellation_credits (client_id, slot_number)
     select $1, number from generate_series(1, 3) as numbers(number)`,
    [clientId],
  );
}

/**
 * @param {{connect: () => Promise<{query: Function, release: Function}>}} pool
 * @param {{name: string, email: string, password: string}} input
 */
export async function createClientAccount(pool, { name, email, password }) {
  const emailNormalized = normalizeEmail(email);
  const passwordHash = await hashPassword(password);
  try {
    return await inTransaction(pool, async (client) => {
      const user = await client.query(
        `insert into users
          (name, email_normalized, password_hash, role, status)
         values ($1, $2, $3, 'CLIENT'::user_role, 'ACTIVE'::user_status)
         returning id, name, email_normalized, role, status, session_version`,
        [name, emailNormalized, passwordHash],
      );
      const row = user.rows[0];
      await insertCancellationCredits(client, row.id);
      await client.query(
        `insert into auth_events (user_id, event_type, successful)
         values ($1, $2, true)`,
        [row.id, "CLIENT_SIGNUP"],
      );
      return publicUser(row);
    });
  } catch (error) {
    if (isNamedEmailDuplicate(error)) throw duplicateEmailError();
    throw error;
  }
}

/**
 * @param {{query: Function}} pool
 * @param {{email: string, password: string}} input
 */
export async function authenticateCredentials(pool, { email, password }) {
  if (typeof pool?.query !== "function") {
    throw new TypeError("A PostgreSQL query client is required");
  }
  const readyDummyPasswordHash = await dummyPasswordHashReady;
  const result = await pool.query(
    `select id, name, email_normalized, password_hash, role, status, session_version
       from users
      where email_normalized = $1
      limit 1`,
    [normalizeEmail(email)],
  );
  const row = result.rows[0];
  const storedHash = row?.password_hash ?? readyDummyPasswordHash;
  const passwordValid = await verifyPassword(password, storedHash);

  if (!row || !row.password_hash || !passwordValid || row.status !== "ACTIVE") {
    return null;
  }
  return publicUser(row);
}

/**
 * @param {{connect: () => Promise<{query: Function, release: Function}>}} pool
 * @param {{actor: {id: string, sessionVersion: number}, name: string, email: string, password: string, displayName: string, specialtySummary: string}} input
 */
export async function createEmployeeAccount(pool, {
  actor,
  name,
  email,
  password,
  displayName,
  specialtySummary,
}) {
  const emailNormalized = normalizeEmail(email);
  try {
    return await inTransaction(pool, async (client) => {
      const actorResult = await client.query(
        `select id, role, status, session_version
           from users
          where id = $1
          for update`,
        [actor?.id],
      );
      const currentActor = actorResult.rows[0];
      if (
        !currentActor
        || currentActor.role !== "ADMIN"
        || currentActor.status !== "ACTIVE"
        || currentActor.session_version !== actor?.sessionVersion
      ) {
        throw new AccountRepositoryError("FORBIDDEN");
      }
      const passwordHash = await hashPassword(password);
      const userResult = await client.query(
        `insert into users
          (name, email_normalized, password_hash, role, status)
         values ($1, $2, $3, 'EMPLOYEE'::user_role, 'ACTIVE'::user_status)
         returning id, name, email_normalized, role, status, session_version`,
        [name, emailNormalized, passwordHash],
      );
      const user = userResult.rows[0];
      const employeeResult = await client.query(
        `insert into employees (user_id, display_name, specialty_summary, status)
         values ($1, $2, $3, 'ACTIVE'::employee_status)
         returning id, user_id, display_name, specialty_summary, status`,
        [user.id, displayName, specialtySummary],
      );
      const employee = employeeResult.rows[0];
      return {
        ...publicUser(user),
        employeeId: employee.id,
        displayName: employee.display_name,
        specialtySummary: employee.specialty_summary,
      };
    });
  } catch (error) {
    if (isNamedEmailDuplicate(error)) throw duplicateEmailError();
    throw error;
  }
}

/**
 * @param {{connect: () => Promise<{query: Function, release: Function}>}} pool
 * @param {{provider: string, providerAccountId: string, email: string, emailVerified: boolean, name: string}} input
 */
export async function resolveGoogleAccount(pool, {
  provider,
  providerAccountId,
  email,
  emailVerified,
  name,
}) {
  if (emailVerified !== true) {
    throw new AccountRepositoryError("GOOGLE_EMAIL_UNVERIFIED");
  }
  const emailNormalized = normalizeEmail(email);
  return inTransaction(pool, async (client) => {
    await client.query(
      "select pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`oauth:${provider}:${providerAccountId}`],
    );
    const providerResult = await client.query(
      `select u.id, u.name, u.email_normalized, u.role, u.status, u.session_version
         from accounts a
         join users u on u.id = a.user_id
        where a.provider = $1 and a.provider_account_id = $2
        for update of a, u`,
      [provider, providerAccountId],
    );
    const providerUser = providerResult.rows[0];
    if (providerUser) {
      if (providerUser.email_normalized !== emailNormalized) {
        throw new AccountRepositoryError("GOOGLE_ACCOUNT_EMAIL_MISMATCH");
      }
      return publicUser(providerUser);
    }

    const existingResult = await client.query(
      `select id, name, email_normalized, role, status, session_version
         from users
        where email_normalized = $1
        for update`,
      [emailNormalized],
    );
    let user = existingResult.rows[0];
    if (!user) {
      const inserted = await client.query(
        `insert into users (name, email_normalized, role, status)
         values ($1, $2, 'CLIENT'::user_role, 'ACTIVE'::user_status)
         on conflict (email_normalized) do nothing
         returning id, name, email_normalized, role, status, session_version`,
        [name, emailNormalized],
      );
      user = inserted.rows[0];
      if (user) {
        await insertCancellationCredits(client, user.id);
      } else {
        const concurrentUser = await client.query(
          `select id, name, email_normalized, role, status, session_version
             from users
            where email_normalized = $1
            for update`,
          [emailNormalized],
        );
        user = concurrentUser.rows[0];
      }
    }
    await client.query(
      `insert into accounts (user_id, type, provider, provider_account_id)
       values ($1, 'oauth', $2, $3)`,
      [user.id, provider, providerAccountId],
    );
    return publicUser(user);
  });
}
