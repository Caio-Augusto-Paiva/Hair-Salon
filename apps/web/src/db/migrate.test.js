import { describe, expect, it, vi } from "vitest";

// `server-only` is a compile-time boundary and intentionally has no runtime
// behavior to exercise in this unit test.
vi.mock("server-only", () => ({}));

describe("migration runner", () => {
  it("runs the Drizzle migrator and closes its isolated pool after success", async () => {
    /** @type {Array<any>} */
    const calls = [];
    const pool = {
      end: async () => {
        calls.push("end");
      },
    };
    const database = { name: "database" };

    const { runMigrations } = await import("./migrate.js");
    await runMigrations("postgresql://example.test/proveras", {
      createPool: (/** @type {string} */ connectionString, /** @type {any} */ options) => {
        calls.push(["createPool", connectionString, options]);
        return pool;
      },
      createDrizzle: (/** @type {any} */ createdPool) => {
        calls.push(["createDrizzle", createdPool]);
        return database;
      },
      migrator: async (/** @type {any} */ createdDatabase, /** @type {any} */ options) => {
        calls.push(["migrator", createdDatabase, options]);
      },
    });

    expect(calls).toEqual([
      ["createPool", "postgresql://example.test/proveras", undefined],
      ["createDrizzle", pool],
      ["migrator", database, { migrationsFolder: "drizzle" }],
      "end",
    ]);
  });

  it("closes its isolated pool and rethrows when migration fails", async () => {
    let ended = false;
    const pool = {
      end: async () => {
        ended = true;
      },
    };
    const migrationError = new Error("migration failed");
    const { runMigrations } = await import("./migrate.js");

    await expect(
      runMigrations("postgresql://example.test/proveras", {
        createPool: () => pool,
        createDrizzle: () => ({ name: "database" }),
        migrator: async () => {
          throw migrationError;
        },
      }),
    ).rejects.toBe(migrationError);
    expect(ended).toBe(true);
  });

  it("stops a started test container when creating its verification pool fails", async () => {
    let stopped = false;
    const poolError = new Error("pool creation failed");
    const container = {
      getHost: () => "127.0.0.1",
      getMappedPort: () => 5432,
      stop: async () => {
        stopped = true;
      },
    };
    const { startTestDatabase } = await import("./test-database.js");

    const originalTestDatabaseUrl = process.env.TEST_DATABASE_URL;
    const originalDatabaseTestUrl = process.env.DATABASE_TEST_URL;
    try {
      delete process.env.TEST_DATABASE_URL;
      delete process.env.DATABASE_TEST_URL;

      await expect(
        startTestDatabase({
          startContainer: async () => container,
          createPool: () => {
            throw poolError;
          },
        }),
      ).rejects.toBe(poolError);
      expect(stopped).toBe(true);
    } finally {
      if (originalTestDatabaseUrl === undefined) {
        delete process.env.TEST_DATABASE_URL;
      } else {
        process.env.TEST_DATABASE_URL = originalTestDatabaseUrl;
      }
      if (originalDatabaseTestUrl === undefined) {
        delete process.env.DATABASE_TEST_URL;
      } else {
        process.env.DATABASE_TEST_URL = originalDatabaseTestUrl;
      }
    }
  });
});
