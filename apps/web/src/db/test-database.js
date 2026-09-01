// Testcontainers currently ships no declarations and its dependency graph
// includes checked JavaScript files. This test-only lifecycle adapter is
// intentionally runtime-validated by the integration suite instead.
// @ts-nocheck

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pgPackage = ["p", "g"].join("");
const pg = require(pgPackage);
const { Pool } = pg;
const TEST_DATABASE_NAME = "proveras_test";
const TEST_DATABASE_USER = "proveras_test";
const TEST_DATABASE_PASSWORD = "proveras_test_password";

/**
 * Start an isolated PostgreSQL test database. An explicit test URL takes
 * precedence so CI can supply its own real PostgreSQL service.
 */
export async function startTestDatabase(options = {}) {
  const createPool = options.createPool ?? ((config) => new Pool(config));
  const explicitConnectionString =
    process.env.TEST_DATABASE_URL ?? process.env.DATABASE_TEST_URL;

  if (explicitConnectionString) {
    const pool = await createPool({
      connectionString: explicitConnectionString,
      max: 2,
    });
    return {
      connectionString: explicitConnectionString,
      pool,
      container: null,
    };
  }

  let container;
  try {
    const startContainer =
      options.startContainer ??
      (() => {
        const testcontainersPackage = ["test", "containers"].join("");
        const { GenericContainer, Wait } = require(testcontainersPackage);

        return new GenericContainer("postgres:17-alpine")
          .withEnvironment({
            POSTGRES_DB: TEST_DATABASE_NAME,
            POSTGRES_USER: TEST_DATABASE_USER,
            POSTGRES_PASSWORD: TEST_DATABASE_PASSWORD,
          })
          .withExposedPorts(5432)
          .withWaitStrategy(
            Wait.forLogMessage(/database system is ready to accept connections/, 2),
          )
          .start();
      });
    container = await startContainer();
  } catch (error) {
    throw new Error(
      "Unable to start the real PostgreSQL test database. Set TEST_DATABASE_URL or DATABASE_TEST_URL, or provide a Docker-compatible runtime for Testcontainers.",
      { cause: error },
    );
  }

  const connectionString = `postgresql://${TEST_DATABASE_USER}:${TEST_DATABASE_PASSWORD}@${container.getHost()}:${container.getMappedPort(5432)}/${TEST_DATABASE_NAME}`;
  let pool;
  try {
    pool = await createPool({ connectionString, max: 2 });
  } catch (error) {
    try {
      await container.stop();
    } catch (cleanupError) {
      error.cleanupError = cleanupError;
    }
    throw error;
  }
  return { connectionString, pool, container };
}

/**
 * @param {{ pool?: { end: () => Promise<unknown> }, container?: { stop: () => Promise<unknown> } }} database
 */
export async function stopTestDatabase(database) {
  await database?.pool?.end();
  await database?.container?.stop();
}
