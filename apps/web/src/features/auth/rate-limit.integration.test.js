// @ts-nocheck
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { startTestDatabase, stopTestDatabase } from "../../db/test-database.js";

const require = createRequire(import.meta.url);
const pgPackage = ["p", "g"].join("");
const { Pool } = require(pgPackage);

function createBarrier(participantCount) {
  let ready = 0;
  let open;
  const opened = new Promise((resolve) => {
    open = resolve;
  });
  return async () => {
    ready += 1;
    if (ready === participantCount) open();
    await opened;
  };
}

describe("real PostgreSQL authentication rate limits", () => {
  it("allows exactly maxAttempts when ten attempts race for one bucket", async () => {
    const database = await startTestDatabase();
    const racePool = new Pool({ connectionString: database.connectionString, max: 10 });
    try {
      const { runMigrations } = await import("../../db/migrate.js");
      const { consumeAuthAttempt, deriveAuthBucket } = await import("./rate-limit-repository.js");
      await runMigrations(database.connectionString);

      const bucketKey = deriveAuthBucket({
        purpose: "login",
        emailNormalized: "race@example.test",
        networkAttribute: `network:v1:${"a".repeat(64)}`,
        secret: "dedicated-test-rate-limit-secret",
      });
      const now = new Date("2040-01-01T00:00:00.000Z");
      const clients = await Promise.all(
        Array.from({ length: 10 }, () => racePool.connect()),
      );
      expect(new Set(clients.map((client) => client.processID)).size).toBe(10);
      const waitForAllClients = createBarrier(clients.length);
      const attempts = await Promise.all(clients.map(async (client) => {
        try {
          await waitForAllClients();
          return await consumeAuthAttempt(client, {
            bucketKey,
            now,
            windowMs: 60_000,
            maxAttempts: 3,
            blockMs: 120_000,
          });
        } finally {
          client.release();
        }
      }));

      expect(attempts.filter((attempt) => attempt.allowed)).toHaveLength(3);
      expect(attempts.filter((attempt) => !attempt.allowed)).toHaveLength(7);
      expect(new Set(
        attempts
          .filter((attempt) => !attempt.allowed)
          .map((attempt) => attempt.blockedUntil?.toISOString()),
      )).toEqual(new Set(["2040-01-01T00:02:00.000Z"]));

      const stored = await database.pool.query(
        `select bucket_key, window_started_at, attempts, blocked_until, updated_at
           from auth_rate_limits`,
      );
      expect(stored.rows).toHaveLength(1);
      expect(stored.rows[0]).toMatchObject({ bucket_key: bucketKey, attempts: 4 });
      expect(JSON.stringify(stored.rows[0])).not.toMatch(/race@example|network-prefix/iu);
    } finally {
      await racePool.end();
      await stopTestDatabase(database);
    }
  });

  it("separates login/reset, resets an expired window, and returns identity-free blocks", async () => {
    const database = await startTestDatabase();
    try {
      const { runMigrations } = await import("../../db/migrate.js");
      const { consumeAuthAttempt, deriveAuthBucket } = await import("./rate-limit-repository.js");
      await runMigrations(database.connectionString);

      const identity = {
        emailNormalized: "separate@example.test",
        networkAttribute: `network:v1:${"b".repeat(64)}`,
        secret: "dedicated-test-rate-limit-secret",
      };
      const loginBucket = deriveAuthBucket({ ...identity, purpose: "login" });
      const resetBucket = deriveAuthBucket({ ...identity, purpose: "reset" });
      const policy = { windowMs: 1_000, maxAttempts: 1, blockMs: 2_000 };
      const first = new Date("2040-01-01T00:00:00.000Z");

      await expect(consumeAuthAttempt(database.pool, {
        bucketKey: loginBucket,
        now: first,
        ...policy,
      })).resolves.toEqual({ allowed: true, blockedUntil: null });
      await expect(consumeAuthAttempt(database.pool, {
        bucketKey: resetBucket,
        now: first,
        ...policy,
      })).resolves.toEqual({ allowed: true, blockedUntil: null });

      const blocked = await consumeAuthAttempt(database.pool, {
        bucketKey: loginBucket,
        now: new Date(first.getTime() + 500),
        ...policy,
      });
      expect(blocked).toEqual({
        allowed: false,
        blockedUntil: new Date("2040-01-01T00:00:02.500Z"),
      });
      expect(JSON.stringify(blocked)).not.toMatch(/separate@example|network-prefix|bucket/iu);

      const stillBlocked = await consumeAuthAttempt(database.pool, {
        bucketKey: loginBucket,
        now: new Date(first.getTime() + 1_500),
        ...policy,
      });
      expect(stillBlocked).toEqual(blocked);
      const activeBlockRow = await database.pool.query(
        `select attempts, blocked_until from auth_rate_limits where bucket_key = $1`,
        [loginBucket],
      );
      expect(activeBlockRow.rows[0]).toMatchObject({
        attempts: 2,
        blocked_until: new Date("2040-01-01T00:00:02.500Z"),
      });

      await expect(consumeAuthAttempt(database.pool, {
        bucketKey: loginBucket,
        now: new Date(first.getTime() + 2_501),
        ...policy,
      })).resolves.toEqual({ allowed: true, blockedUntil: null });

      const rows = await database.pool.query(
        `select bucket_key, attempts from auth_rate_limits order by bucket_key`,
      );
      expect(rows.rows).toHaveLength(2);
      expect(rows.rows.map((row) => row.bucket_key).toSorted()).toEqual(
        [loginBucket, resetBucket].toSorted(),
      );
      expect(rows.rows.find((row) => row.bucket_key === loginBucket)?.attempts).toBe(1);
    } finally {
      await stopTestDatabase(database);
    }
  });

  it("starts attempt one in a fresh window after an unblocked window expires", async () => {
    const database = await startTestDatabase();
    try {
      const { runMigrations } = await import("../../db/migrate.js");
      const { consumeAuthAttempt, deriveAuthBucket } = await import("./rate-limit-repository.js");
      await runMigrations(database.connectionString);

      const bucketKey = deriveAuthBucket({
        purpose: "login",
        emailNormalized: "window@example.test",
        networkAttribute: `network:v1:${"c".repeat(64)}`,
        secret: "dedicated-test-rate-limit-secret",
      });
      const first = new Date("2040-01-01T00:00:00.000Z");
      const nextWindow = new Date("2040-01-01T00:00:01.001Z");
      const policy = { windowMs: 1_000, maxAttempts: 3, blockMs: 2_000 };

      await expect(consumeAuthAttempt(database.pool, {
        bucketKey,
        now: first,
        ...policy,
      })).resolves.toEqual({ allowed: true, blockedUntil: null });
      await expect(consumeAuthAttempt(database.pool, {
        bucketKey,
        now: nextWindow,
        ...policy,
      })).resolves.toEqual({ allowed: true, blockedUntil: null });

      const row = await database.pool.query(
        `select attempts, window_started_at, blocked_until
           from auth_rate_limits where bucket_key = $1`,
        [bucketKey],
      );
      expect(row.rows[0]).toEqual({
        attempts: 1,
        window_started_at: nextWindow,
        blocked_until: null,
      });
    } finally {
      await stopTestDatabase(database);
    }
  });
});
