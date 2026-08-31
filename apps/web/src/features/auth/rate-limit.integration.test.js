// @ts-nocheck
import { describe, expect, it } from "vitest";
import { startTestDatabase, stopTestDatabase } from "../../db/test-database.js";

describe("real PostgreSQL authentication rate limits", () => {
  it("allows exactly maxAttempts when ten attempts race for one bucket", async () => {
    const database = await startTestDatabase();
    try {
      const { runMigrations } = await import("../../db/migrate.js");
      const { consumeAuthAttempt, deriveAuthBucket } = await import("./rate-limit-repository.js");
      await runMigrations(database.connectionString);

      const bucketKey = deriveAuthBucket({
        purpose: "login",
        emailNormalized: "race@example.test",
        networkAttribute: "network-prefix:v1:race",
        secret: "dedicated-test-rate-limit-secret",
      });
      const now = new Date("2040-01-01T00:00:00.000Z");
      const attempts = await Promise.all(
        Array.from({ length: 10 }, () => consumeAuthAttempt(database.pool, {
          bucketKey,
          now,
          windowMs: 60_000,
          maxAttempts: 3,
          blockMs: 120_000,
        })),
      );

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
        networkAttribute: "network-prefix:v1:separate",
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
});
