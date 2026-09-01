import { afterEach, describe, expect, it, vi } from "vitest";

const originalRuntimeUrl = process.env.DATABASE_URL;
const originalDirectUrl = process.env.DATABASE_DIRECT_URL;

afterEach(() => {
  if (originalRuntimeUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalRuntimeUrl;
  if (originalDirectUrl === undefined) delete process.env.DATABASE_DIRECT_URL;
  else process.env.DATABASE_DIRECT_URL = originalDirectUrl;
  vi.resetModules();
});

describe("Drizzle Kit connection boundary", () => {
  it("uses DATABASE_DIRECT_URL when runtime and direct connections both exist", async () => {
    process.env.DATABASE_URL = "postgresql://runtime.example.test/proveras";
    process.env.DATABASE_DIRECT_URL = "postgresql://direct.example.test/proveras";
    vi.resetModules();

    const { default: config } = await import("../../drizzle.config.js");

    expect(/** @type {any} */ (config).dbCredentials.url).toBe(
      "postgresql://direct.example.test/proveras",
    );
  });

  it("rejects Drizzle Kit configuration when the direct connection is absent", async () => {
    process.env.DATABASE_URL = "postgresql://runtime.example.test/proveras";
    delete process.env.DATABASE_DIRECT_URL;
    vi.resetModules();

    await expect(import("../../drizzle.config.js")).rejects.toThrow(
      "DATABASE_DIRECT_URL is required for Drizzle Kit",
    );
  });
});
