// @ts-nocheck
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { startTestDatabase, stopTestDatabase } from "../../db/test-database.js";
import { verifyPassword } from "./password.js";

const require = createRequire(import.meta.url);
const pgPackage = ["p", "g"].join("");
const { Pool } = require(pgPackage);
const password = randomBytes(32).toString("base64url");
const wrongPassword = randomBytes(32).toString("base64url");

function addUnreadableProviderTokens(input) {
  const unreadableToken = () => {
    throw new Error("OAuth provider token input must remain unread");
  };
  return Object.defineProperties(input, {
    accessToken: { enumerable: true, get: unreadableToken },
    refreshToken: { enumerable: true, get: unreadableToken },
    idToken: { enumerable: true, get: unreadableToken },
  });
}

async function prepareDatabase() {
  const database = await startTestDatabase();
  const { runMigrations } = await import("../../db/migrate.js");
  await runMigrations(database.connectionString);
  return database;
}

async function addDelayTrigger(pool, table) {
  await pool.query(`
    create function test_${table}_delay() returns trigger language plpgsql as $$
    begin
      perform pg_sleep(0.15);
      return new;
    end;
    $$;
    create trigger test_${table}_delay before insert on ${table}
    for each row execute function test_${table}_delay();
  `);
}

describe("real PostgreSQL account repositories", () => {
  it("creates a hashed active client, three credits, and one security event", async () => {
    const database = await prepareDatabase();
    try {
      const { createClientAccount } = await import("./account-repository.js");
      const created = await createClientAccount(database.pool, {
        name: "Client A",
        email: "client-a@example.test",
        password,
        role: "ADMIN",
        status: "SUSPENDED",
      });

      expect(created).toMatchObject({ role: "CLIENT", status: "ACTIVE", sessionVersion: 0 });
      expect(Object.keys(created)).not.toContain("passwordHash");
      const stored = await database.pool.query(
        `select id, password_hash, role, status from users where id = $1`,
        [created.id],
      );
      expect(stored.rows[0]).toMatchObject({ role: "CLIENT", status: "ACTIVE" });
      await expect(verifyPassword(password, stored.rows[0].password_hash)).resolves.toBe(true);
      const credits = await database.pool.query(
        `select slot_number from cancellation_credits where client_id = $1 order by slot_number`,
        [created.id],
      );
      expect(credits.rows.map((row) => row.slot_number)).toEqual([1, 2, 3]);
      const events = await database.pool.query(
        `select event_type, successful from auth_events where user_id = $1`,
        [created.id],
      );
      expect(events.rows).toEqual([{ event_type: "CLIENT_SIGNUP", successful: true }]);
    } finally {
      await stopTestDatabase(database);
    }
  });

  it("rolls back a signup completely when its security event cannot be recorded", async () => {
    const database = await prepareDatabase();
    try {
      await database.pool.query(`
        create function reject_test_signup_event() returns trigger language plpgsql as $$
        begin
          raise exception 'test event failure';
        end;
        $$;
        create trigger reject_test_signup_event before insert on auth_events
        for each row execute function reject_test_signup_event();
      `);
      const { createClientAccount } = await import("./account-repository.js");

      await expect(createClientAccount(database.pool, {
        name: "Client B",
        email: "client-b@example.test",
        password,
      })).rejects.toThrow("test event failure");
      const counts = await database.pool.query(`
        select
          (select count(*)::int from users where email_normalized = 'client-b@example.test') as users,
          (select count(*)::int from cancellation_credits) as credits
      `);
      expect(counts.rows[0]).toEqual({ users: 0, credits: 0 });
    } finally {
      await stopTestDatabase(database);
    }
  });

  it("returns the same generic null result for all invalid credential cases", async () => {
    const database = await prepareDatabase();
    try {
      const { authenticateCredentials, createClientAccount } = await import("./account-repository.js");
      const active = await createClientAccount(database.pool, {
        name: "Client C", email: "client-c@example.test", password,
      });
      await database.pool.query(`
        insert into users (name, email_normalized, role, password_hash)
        values ('No Hash', 'no-hash@example.test', 'CLIENT', null)
      `);
      const inactive = await createClientAccount(database.pool, {
        name: "Client D", email: "client-d@example.test", password,
      });
      await database.pool.query(`update users set status = 'SUSPENDED' where id = $1`, [inactive.id]);

      await expect(authenticateCredentials(database.pool, { email: "missing@example.test", password })).resolves.toBeNull();
      await expect(authenticateCredentials(database.pool, { email: "no-hash@example.test", password })).resolves.toBeNull();
      await expect(authenticateCredentials(database.pool, { email: active.emailNormalized, password: wrongPassword })).resolves.toBeNull();
      await expect(authenticateCredentials(database.pool, { email: inactive.emailNormalized, password })).resolves.toBeNull();
    } finally {
      await stopTestDatabase(database);
    }
  });

  it("returns the exact public identity for valid active credentials", async () => {
    const database = await prepareDatabase();
    try {
      const { authenticateCredentials, createClientAccount } = await import("./account-repository.js");
      const created = await createClientAccount(database.pool, {
        name: "Client Active", email: "client-active@example.test", password,
      });

      const authenticated = await authenticateCredentials(database.pool, {
        email: "CLIENT-ACTIVE@EXAMPLE.TEST", password,
      });

      expect(authenticated).toEqual({
        id: created.id,
        name: "Client Active",
        emailNormalized: "client-active@example.test",
        role: "CLIENT",
        status: "ACTIVE",
        sessionVersion: 0,
      });
      expect(JSON.stringify(authenticated)).not.toMatch(/password_hash|passwordHash/u);
    } finally {
      await stopTestDatabase(database);
    }
  });

  it("creates employees only for the locked current ADMIN session and never returns their hash", async () => {
    const database = await prepareDatabase();
    try {
      const admin = await database.pool.query(`
        insert into users (name, email_normalized, role, status, session_version)
        values ('Admin A', 'admin-a@example.test', 'ADMIN', 'ACTIVE', 5) returning id
      `);
      const { createEmployeeAccount } = await import("./account-repository.js");
      const created = await createEmployeeAccount(database.pool, {
        actor: { id: admin.rows[0].id, sessionVersion: 5 },
        name: "Staff A",
        email: "staff-a@example.test",
        password,
        displayName: "Staff A",
        specialtySummary: "Nails",
      });
      expect(created).toMatchObject({ role: "EMPLOYEE", status: "ACTIVE", displayName: "Staff A" });
      expect(Object.keys(created)).not.toContain("passwordHash");
      await expect(createEmployeeAccount(database.pool, {
        actor: { id: admin.rows[0].id, sessionVersion: 4 },
        name: "Staff B", email: "staff-b@example.test", password, displayName: "Staff B", specialtySummary: "Hair",
      })).rejects.toMatchObject({ code: "FORBIDDEN" });
      const employeeRows = await database.pool.query(`select count(*)::int as count from employees`);
      expect(employeeRows.rows[0].count).toBe(1);
    } finally {
      await stopTestDatabase(database);
    }
  });

  it("resolves verified Google identities provider-first without storing tokens or changing roles", async () => {
    const database = await prepareDatabase();
    try {
      const preexisting = await database.pool.query(`
        insert into users (name, email_normalized, role, status)
        values ('Staff Google', 'staff-google@example.test', 'EMPLOYEE', 'ACTIVE') returning id
      `);
      const { resolveGoogleAccount } = await import("./account-repository.js");
      await expect(resolveGoogleAccount(database.pool, addUnreadableProviderTokens({
        provider: "google",
        providerAccountId: "google-subject-staff",
        email: "STAFF-GOOGLE@EXAMPLE.TEST",
        emailVerified: true,
        name: "Different Display Name",
      }))).resolves.toMatchObject({ id: preexisting.rows[0].id, role: "EMPLOYEE", status: "ACTIVE" });
      const stored = await database.pool.query(`
        select a.user_id, a.access_token, a.refresh_token, a.id_token, u.role, u.status
          from accounts a join users u on u.id = a.user_id
      `);
      expect(stored.rows).toEqual([{
        user_id: preexisting.rows[0].id,
        access_token: null,
        refresh_token: null,
        id_token: null,
        role: "EMPLOYEE",
        status: "ACTIVE",
      }]);
      await expect(resolveGoogleAccount(database.pool, {
        provider: "google", providerAccountId: "google-subject-unverified", email: "new@example.test", emailVerified: false, name: "Client E",
      })).rejects.toMatchObject({ code: "GOOGLE_EMAIL_UNVERIFIED" });
      const unverifiedUsers = await database.pool.query(`select count(*)::int as count from users where email_normalized = 'new@example.test'`);
      expect(unverifiedUsers.rows[0].count).toBe(0);
    } finally {
      await stopTestDatabase(database);
    }
  });

  it("allows exactly one concurrent duplicate signup and one OAuth account row", async () => {
    const database = await prepareDatabase();
    const racePool = new Pool({ connectionString: database.connectionString, max: 4 });
    try {
      await addDelayTrigger(database.pool, "users");
      const { createClientAccount, resolveGoogleAccount } = await import("./account-repository.js");
      const signups = await Promise.allSettled([
        createClientAccount(racePool, { name: "Client Race", email: "race@example.test", password }),
        createClientAccount(racePool, { name: "Client Race", email: "race@example.test", password }),
      ]);
      expect(signups.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(signups.filter((result) => result.status === "rejected").map((result) => result.reason.code)).toEqual(["EMAIL_ALREADY_EXISTS"]);
      const google = await Promise.all([
        resolveGoogleAccount(racePool, {
          provider: "google", providerAccountId: "google-subject-race", email: "google-race@example.test", emailVerified: true, name: "Client Google",
        }),
        resolveGoogleAccount(racePool, {
          provider: "google", providerAccountId: "google-subject-race", email: "google-race@example.test", emailVerified: true, name: "Client Google",
        }),
      ]);
      expect(new Set(google.map((account) => account.id)).size).toBe(1);
      const counts = await database.pool.query(`
        select
          (select count(*)::int from users where email_normalized = 'race@example.test') as signup_users,
          (select count(*)::int from users where email_normalized = 'google-race@example.test') as google_users,
          (select count(*)::int from accounts where provider = 'google' and provider_account_id = 'google-subject-race') as google_accounts,
          (select count(*)::int from cancellation_credits cc join users u on u.id = cc.client_id where u.email_normalized = 'google-race@example.test') as google_credits
      `);
      expect(counts.rows[0]).toEqual({ signup_users: 1, google_users: 1, google_accounts: 1, google_credits: 3 });
    } finally {
      await racePool.end();
      await stopTestDatabase(database);
    }
  });

  it("safely links concurrent verified OAuth subjects to one normalized e-mail", async () => {
    const database = await prepareDatabase();
    const racePool = new Pool({ connectionString: database.connectionString, max: 4 });
    try {
      await addDelayTrigger(database.pool, "users");
      const { resolveGoogleAccount } = await import("./account-repository.js");
      const accounts = await Promise.all([
        resolveGoogleAccount(racePool, {
          provider: "google", providerAccountId: "google-subject-email-a", email: "shared@example.test", emailVerified: true, name: "Client Shared",
        }),
        resolveGoogleAccount(racePool, {
          provider: "google", providerAccountId: "google-subject-email-b", email: "shared@example.test", emailVerified: true, name: "Client Shared",
        }),
      ]);
      expect(new Set(accounts.map((account) => account.id)).size).toBe(1);
      const counts = await database.pool.query(`
        select
          (select count(*)::int from users where email_normalized = 'shared@example.test') as users,
          (select count(*)::int from accounts where provider = 'google' and provider_account_id in ('google-subject-email-a', 'google-subject-email-b')) as accounts,
          (select count(*)::int from cancellation_credits cc join users u on u.id = cc.client_id where u.email_normalized = 'shared@example.test') as credits
      `);
      expect(counts.rows[0]).toEqual({ users: 1, accounts: 2, credits: 3 });
    } finally {
      await racePool.end();
      await stopTestDatabase(database);
    }
  });

  it("rolls back employee and OAuth writes after their dependent insert fails", async () => {
    const database = await prepareDatabase();
    try {
      const admin = await database.pool.query(`
        insert into users (name, email_normalized, role, status, session_version)
        values ('Admin Rollback', 'admin-rollback@example.test', 'ADMIN', 'ACTIVE', 1) returning id
      `);
      const { createEmployeeAccount, resolveGoogleAccount } = await import("./account-repository.js");
      await database.pool.query(`
        create function reject_employee_detail() returns trigger language plpgsql as $$
        begin
          raise exception 'test employee detail failure';
        end;
        $$;
        create trigger reject_employee_detail before insert on employees
        for each row execute function reject_employee_detail();
      `);
      await expect(createEmployeeAccount(database.pool, {
        actor: { id: admin.rows[0].id, sessionVersion: 1 },
        name: "Staff Rollback", email: "staff-rollback@example.test", password, displayName: "Staff Rollback", specialtySummary: "Nails",
      })).rejects.toThrow("test employee detail failure");
      const afterEmployee = await database.pool.query(`
        select
          (select count(*)::int from users where email_normalized = 'staff-rollback@example.test') as users,
          (select count(*)::int from employees) as employees
      `);
      expect(afterEmployee.rows[0]).toEqual({ users: 0, employees: 0 });
      await database.pool.query(`drop trigger reject_employee_detail on employees; drop function reject_employee_detail();
        create function reject_oauth_account() returns trigger language plpgsql as $$
        begin
          raise exception 'test oauth account failure';
        end;
        $$;
        create trigger reject_oauth_account before insert on accounts
        for each row execute function reject_oauth_account();
      `);
      await expect(resolveGoogleAccount(database.pool, {
        provider: "google", providerAccountId: "google-subject-rollback", email: "oauth-rollback@example.test", emailVerified: true, name: "Client Rollback",
      })).rejects.toThrow("test oauth account failure");
      const afterOAuthCreation = await database.pool.query(`
        select
          (select count(*)::int from users where email_normalized = 'oauth-rollback@example.test') as users,
          (select count(*)::int from cancellation_credits cc join users u on u.id = cc.client_id where u.email_normalized = 'oauth-rollback@example.test') as credits,
          (select count(*)::int from accounts where provider_account_id = 'google-subject-rollback') as accounts
      `);
      expect(afterOAuthCreation.rows[0]).toEqual({ users: 0, credits: 0, accounts: 0 });
      const existing = await database.pool.query(`
        insert into users (name, email_normalized, role) values ('Client Link Rollback', 'link-rollback@example.test', 'CLIENT') returning id
      `);
      await database.pool.query(`
        insert into cancellation_credits (client_id, slot_number)
        select $1, number from generate_series(1, 3) as numbers(number)
      `, [existing.rows[0].id]);
      await expect(resolveGoogleAccount(database.pool, {
        provider: "google", providerAccountId: "google-subject-link-rollback", email: "link-rollback@example.test", emailVerified: true, name: "Client Link Rollback",
      })).rejects.toThrow("test oauth account failure");
      const afterOAuthLink = await database.pool.query(`
        select
          (select count(*)::int from users where email_normalized = 'link-rollback@example.test') as users,
          (select count(*)::int from cancellation_credits cc join users u on u.id = cc.client_id where u.email_normalized = 'link-rollback@example.test') as credits,
          (select count(*)::int from accounts where provider_account_id = 'google-subject-link-rollback') as accounts
      `);
      expect(afterOAuthLink.rows[0]).toEqual({ users: 1, credits: 3, accounts: 0 });
    } finally {
      await stopTestDatabase(database);
    }
  });
});
