import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { startTestDatabase, stopTestDatabase } from "../test-database.js";
import { seedDevelopmentDatabase } from "./development.js";

const require = createRequire(import.meta.url);
const { drizzle } = require(["drizzle-orm", "node-postgres"].join("/"));

describe("privacy-safe development seed", () => {
  it("seeds exact catalog, fictitious clients, and three credits idempotently", async () => {
    const testDatabase = await startTestDatabase();
    try {
      const { runMigrations } = await import("../migrate.js");
      await runMigrations(testDatabase.connectionString);
      const database = drizzle(testDatabase.pool);

      const previous = process.env.DEVELOPMENT_SEED_ENABLED;
      process.env.DEVELOPMENT_SEED_ENABLED = "true";
      let firstSnapshot;
      let secondSnapshot;
      try {
        await seedDevelopmentDatabase(database);
        firstSnapshot = await snapshot(testDatabase.pool);
        await seedDevelopmentDatabase(database);
        secondSnapshot = await snapshot(testDatabase.pool);
      } finally {
        if (previous === undefined) delete process.env.DEVELOPMENT_SEED_ENABLED;
        else process.env.DEVELOPMENT_SEED_ENABLED = previous;
      }

      expect(secondSnapshot).toEqual(firstSnapshot);
      expect(firstSnapshot.services).toHaveLength(9);
      expect(firstSnapshot.services.every(/** @param {{price_verified_at: Date|null}} service */ (service) => service.price_verified_at === null)).toBe(true);
      expect(firstSnapshot.portfolio).toHaveLength(12);
      expect(firstSnapshot.clients.map(/** @param {{email_normalized: string}} client */ (client) => client.email_normalized)).toEqual([
        "cliente-01-demo@example.com",
        "cliente-02-demo@example.com",
      ]);
      expect(firstSnapshot.credits).toEqual([
        { email_normalized: "cliente-01-demo@example.com", credit_count: 3 },
        { email_normalized: "cliente-02-demo@example.com", credit_count: 3 },
      ]);
      expect(firstSnapshot.staffSignupArtifacts).toBe(0);
    } finally {
      await stopTestDatabase(testDatabase);
    }
  });

  it("requires the explicit development seed guard", async () => {
    const database = { transaction: async () => { throw new Error("must not execute"); } };
    const previous = process.env.DEVELOPMENT_SEED_ENABLED;
    delete process.env.DEVELOPMENT_SEED_ENABLED;
    await expect(seedDevelopmentDatabase(database)).rejects.toThrow("DEVELOPMENT_SEED_ENABLED=true");
    if (previous === undefined) delete process.env.DEVELOPMENT_SEED_ENABLED;
    else process.env.DEVELOPMENT_SEED_ENABLED = previous;
  });
});

/** @param {{query: (text: string) => Promise<{rows: any[]}>}} pool */
async function snapshot(pool) {
  const [services, portfolio, clients, credits, staffSignupArtifacts] = await Promise.all([
    pool.query(`select name, duration_minutes, price_cents, price_verified_at
                from services order by name`),
    pool.query(`select asset_path, alternative_text from portfolio_items order by display_order`),
    pool.query(`select id, email_normalized from users where role = 'CLIENT' order by email_normalized`),
    pool.query(`select u.email_normalized, count(*)::int as credit_count
                from cancellation_credits cc
                join users u on u.id = cc.client_id
                where u.role = 'CLIENT'
                group by u.email_normalized order by u.email_normalized`),
    pool.query(`select count(*)::int as count from password_reset_tokens where token_hash like 'seed:%'`),
  ]);
  return {
    services: services.rows,
    portfolio: portfolio.rows,
    clients: clients.rows,
    credits: credits.rows,
    staffSignupArtifacts: staffSignupArtifacts.rows[0].count,
  };
}
