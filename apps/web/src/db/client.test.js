import { describe, expect, it, vi } from "vitest";

// `server-only` is a compile-time boundary and intentionally has no runtime
// behavior to exercise in this unit test.
vi.mock("server-only", () => ({}));

describe("database pool", () => {
  it("passes the connection string and a bounded pool size to the injected Pool constructor", async () => {
    /** @type {Array<Record<string, any>>} */
    const constructorCalls = [];
    class CapturingPool {
      /** @param {Record<string, any>} config */
      constructor(config) {
        constructorCalls.push(config);
      }
    }

    const { createDatabasePool } = await import("./client.js");
    const pool = createDatabasePool("postgresql://example.test/proveras", {
      max: 4,
      Pool: CapturingPool,
    });

    expect(pool).toBeInstanceOf(CapturingPool);
    expect(constructorCalls).toEqual([
      {
        connectionString: "postgresql://example.test/proveras",
        max: 4,
      },
    ]);
  });
});
