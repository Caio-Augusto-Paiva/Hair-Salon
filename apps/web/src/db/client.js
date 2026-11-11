import "server-only";

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pgPackage = ["p", "g"].join("");
const drizzlePackage = ["drizzle-orm", "node-postgres"].join("/");
const pg = require(pgPackage);
const { drizzle } = require(drizzlePackage);
const { Pool: PgPool } = pg;
const DEFAULT_POOL_MAX = 10;
const MAX_POOL_MAX = 20;

/**
 * @param {unknown} value
 */
function boundedPoolMax(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_POOL_MAX;
  return Math.min(parsed, MAX_POOL_MAX);
}

/**
 * @param {string} connectionString
 * @param {Record<string, any>} [options]
 */
export function createDatabasePool(connectionString, options = {}) {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to create a database pool");
  }

  const {
    Pool: PoolConstructor = PgPool,
    max = process.env.DATABASE_POOL_MAX,
    ...poolOptions
  } = options;

  return new PoolConstructor({
    ...poolOptions,
    connectionString,
    max: boundedPoolMax(max),
  });
}

export const pool = process.env.DATABASE_URL
  ? createDatabasePool(process.env.DATABASE_URL)
  : null;
export const db = pool ? drizzle(pool) : null;
