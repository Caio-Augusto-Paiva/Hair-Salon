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

  it("serializes concurrent runs without duplicate fixtures", async () => {
    const testDatabase = await startTestDatabase();
    try {
      const { runMigrations } = await import("../migrate.js");
      await runMigrations(testDatabase.connectionString);
      const database = drizzle(testDatabase.pool);
      const previous = process.env.DEVELOPMENT_SEED_ENABLED;
      process.env.DEVELOPMENT_SEED_ENABLED = "true";
      try {
        await Promise.all([seedDevelopmentDatabase(database), seedDevelopmentDatabase(database)]);
      } finally {
        restoreSeedFlag(previous);
      }

      const result = await snapshot(testDatabase.pool);
      expect(result.services).toHaveLength(9);
      expect(result.portfolio).toHaveLength(12);
      expect(result.clients.map(/** @param {{email_normalized: string}} client */ (client) => client.email_normalized)).toEqual([
        "cliente-01-demo@example.com",
        "cliente-02-demo@example.com",
      ]);
      expect(result.credits).toEqual([
        { email_normalized: "cliente-01-demo@example.com", credit_count: 3 },
        { email_normalized: "cliente-02-demo@example.com", credit_count: 3 },
      ]);
    } finally {
      await stopTestDatabase(testDatabase);
    }
  });

  it("fills missing fixtures without overwriting existing changes", async () => {
    const testDatabase = await startTestDatabase();
    try {
      const { runMigrations } = await import("../migrate.js");
      await runMigrations(testDatabase.connectionString);
      const database = drizzle(testDatabase.pool);
      const previous = process.env.DEVELOPMENT_SEED_ENABLED;
      process.env.DEVELOPMENT_SEED_ENABLED = "true";
      try {
        await seedDevelopmentDatabase(database);

        await testDatabase.pool.query(`
          update services
             set duration_minutes = 77, price_cents = 7777,
                 price_verified_at = '2040-01-01T00:00:00Z', active = false
           where name = 'Escova'
        `);
        await testDatabase.pool.query(`
          update portfolio_items
             set alternative_text = 'Texto preservado', display_order = 99, active = false
           where asset_path = '/images/portfolio/ProtifolioUnhas.png'
        `);
        await testDatabase.pool.query(`
          update users
             set name = 'Identidade preservada', role = 'ADMIN', status = 'SUSPENDED'
           where email_normalized = 'cliente-01-demo@example.com'
        `);
        await testDatabase.pool.query(`
          update employees
             set display_name = 'Profissional preservada', status = 'INACTIVE'
           where user_id = (select id from users where email_normalized = 'funcionaria-01-demo@example.com')
        `);
        await testDatabase.pool.query(`
          update employee_services
             set enabled = false
           where employee_id = (select e.id from employees e join users u on u.id = e.user_id
                                where u.email_normalized = 'funcionaria-01-demo@example.com')
             and service_id = (select id from services where name = 'Escova')
        `);

        await seedDevelopmentDatabase(database);
      } finally {
        restoreSeedFlag(previous);
      }

      const preserved = await testDatabase.pool.query(`
        select
          (select duration_minutes from services where name = 'Escova') as service_duration,
          (select price_cents from services where name = 'Escova') as service_price,
          (select price_verified_at from services where name = 'Escova') as service_verified,
          (select active from services where name = 'Escova') as service_active,
          (select alternative_text from portfolio_items where asset_path = '/images/portfolio/ProtifolioUnhas.png') as portfolio_text,
          (select display_order from portfolio_items where asset_path = '/images/portfolio/ProtifolioUnhas.png') as portfolio_order,
          (select active from portfolio_items where asset_path = '/images/portfolio/ProtifolioUnhas.png') as portfolio_active,
          (select name from users where email_normalized = 'cliente-01-demo@example.com') as client_name,
          (select role from users where email_normalized = 'cliente-01-demo@example.com') as client_role,
          (select status from users where email_normalized = 'cliente-01-demo@example.com') as client_status,
          (select e.display_name from employees e join users u on u.id = e.user_id
             where u.email_normalized = 'funcionaria-01-demo@example.com') as employee_display,
          (select e.status from employees e join users u on u.id = e.user_id
             where u.email_normalized = 'funcionaria-01-demo@example.com') as employee_status,
          (select enabled from employee_services
             where employee_id = (select e.id from employees e join users u on u.id = e.user_id
                                  where u.email_normalized = 'funcionaria-01-demo@example.com')
               and service_id = (select id from services where name = 'Escova')) as employee_service
      `);
      expect(preserved.rows[0]).toEqual({
        service_duration: 77,
        service_price: 7777,
        service_verified: new Date("2040-01-01T00:00:00Z"),
        service_active: false,
        portfolio_text: "Texto preservado",
        portfolio_order: 99,
        portfolio_active: false,
        client_name: "Identidade preservada",
        client_role: "ADMIN",
        client_status: "SUSPENDED",
        employee_display: "Profissional preservada",
        employee_status: "INACTIVE",
        employee_service: false,
      });
    } finally {
      await stopTestDatabase(testDatabase);
    }
  });
});

/** @param {string|undefined} previous */
function restoreSeedFlag(previous) {
  if (previous === undefined) delete process.env.DEVELOPMENT_SEED_ENABLED;
  else process.env.DEVELOPMENT_SEED_ENABLED = previous;
}

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
