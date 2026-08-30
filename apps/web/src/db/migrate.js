import "server-only";

import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createDatabasePool } from "./client.js";

const require = createRequire(import.meta.url);
const drizzlePackage = ["drizzle-orm", "node-postgres"].join("/");
const migratorPackage = [drizzlePackage, "migrator"].join("/");
const { drizzle } = require(drizzlePackage);
const { migrate } = require(migratorPackage);

/**
 * Run all pending migrations using an isolated pool that is always closed.
 *
 * @param {string} [connectionString]
 * @param {Record<string, any>} [options]
 */
export async function runMigrations(
  connectionString = process.env.DATABASE_URL,
  options = {},
) {
  const poolFactory = options.createPool ?? createDatabasePool;
  const drizzleFactory = options.createDrizzle ?? drizzle;
  const migrationRunner = options.migrator ?? options.migrate ?? migrate;
  const pool = poolFactory(connectionString, options.poolOptions);

  try {
    const database = drizzleFactory(pool);
    await migrationRunner(database, { migrationsFolder: "drizzle" });
  } finally {
    await pool.end();
  }
}

const isMainModule =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  runMigrations().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
