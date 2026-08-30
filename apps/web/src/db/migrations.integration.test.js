import { startTestDatabase, stopTestDatabase } from "./test-database.js";
import { describe, expect, it } from "vitest";

describe("PostgreSQL migration lifecycle", () => {
  it("applies extensions and journaled migrations idempotently on repeated runs", async () => {
    const testDatabase = await startTestDatabase();
    try {
      const { connectionString, pool: verificationPool } = testDatabase;
      const { runMigrations } = await import("./migrate.js");

      await runMigrations(connectionString);
      await runMigrations(connectionString);

      const extensions = await verificationPool.query(
        `select extname from pg_extension where extname in ('btree_gist', 'pgcrypto') order by extname`,
      );
      expect(
        extensions.rows.map(/** @param {any} row */ (row) => row.extname),
      ).toEqual(["btree_gist", "pgcrypto"]);

      const journal = await verificationPool.query(
        `select count(*)::int as count from "drizzle"."__drizzle_migrations"`,
      );
      expect(journal.rows[0].count).toBe(1);
    } finally {
      await stopTestDatabase(testDatabase);
    }
  });
});
