// @ts-nocheck
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const networkAttribute = `network:v1:${"a".repeat(64)}`;

function lengthPrefixed(value) {
  const bytes = Buffer.from(value, "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  return Buffer.concat([length, bytes]);
}

describe("authentication rate-limit repository", () => {
  it("derives deterministic, domain-separated HMAC-SHA-256 bucket keys", async () => {
    const { deriveAuthBucket } = await import("./rate-limit-repository.js");
    const input = {
      emailNormalized: "ana@example.com",
      networkAttribute,
      secret: "dedicated-test-rate-limit-secret",
    };

    const login = deriveAuthBucket({ ...input, purpose: "login" });
    const reset = deriveAuthBucket({ ...input, purpose: "reset" });
    const expectedPayload = Buffer.concat([
      Buffer.from("proveras:auth-rate-limit:v1", "utf8"),
      lengthPrefixed("login"),
      lengthPrefixed(input.emailNormalized),
      lengthPrefixed(input.networkAttribute),
    ]);
    const expected = createHmac("sha256", input.secret)
      .update(expectedPayload)
      .digest("hex");

    expect(login).toBe(expected);
    expect(login).toMatch(/^[0-9a-f]{64}$/u);
    expect(reset).toMatch(/^[0-9a-f]{64}$/u);
    expect(reset).not.toBe(login);
    expect(login).not.toContain(input.emailNormalized);
    expect(login).not.toContain(input.networkAttribute);
  });

  it.each([
    ["purpose", { purpose: "signup" }],
    ["emailNormalized", { emailNormalized: " Ana@example.com" }],
    ["raw network IP", { networkAttribute: "203.0.113.10" }],
    ["networkAttribute", { networkAttribute: "" }],
    ["network control", { networkAttribute: `${networkAttribute}\0` }],
    ["email control", { emailNormalized: "ana\0@example.com" }],
    ["secret control", { secret: "dedicated-test\0rate-limit-secret" }],
    ["secret", { secret: "" }],
  ])("rejects invalid %s before deriving a bucket", async (_label, override) => {
    const { deriveAuthBucket } = await import("./rate-limit-repository.js");
    expect(() => deriveAuthBucket({
      purpose: "login",
      emailNormalized: "ana@example.com",
      networkAttribute,
      secret: "dedicated-test-rate-limit-secret",
      ...override,
    })).toThrow(TypeError);
  });

  it("rejects both structurally ambiguous NUL-delimited input pairs", async () => {
    const { deriveAuthBucket } = await import("./rate-limit-repository.js");
    const common = {
      purpose: "login",
      secret: "dedicated-test-rate-limit-secret",
    };

    expect(() => deriveAuthBucket({
      ...common,
      emailNormalized: "a",
      networkAttribute: "b\0c",
    })).toThrow(TypeError);
    expect(() => deriveAuthBucket({
      ...common,
      emailNormalized: "a\0b",
      networkAttribute: "c",
    })).toThrow(TypeError);
  });

  it("uses one parameterized atomic upsert and returns only generic block state", async () => {
    const calls = [];
    const client = {
      query: async (text, values) => {
        calls.push([text, values]);
        return {
          rows: [{ allowed: false, blocked_until: new Date("2040-01-01T00:01:00.000Z") }],
        };
      },
    };
    const { consumeAuthAttempt } = await import("./rate-limit-repository.js");
    const now = new Date("2040-01-01T00:00:00.000Z");
    const result = await consumeAuthAttempt(client, {
      bucketKey: "a".repeat(64),
      now,
      windowMs: 60_000,
      maxAttempts: 3,
      blockMs: 120_000,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toMatch(/insert into auth_rate_limits[\s\S]*on conflict \(bucket_key\)[\s\S]*do update/iu);
    expect(calls[0][0]).not.toContain("ana@example.com");
    expect(calls[0][1]).toEqual(["a".repeat(64), now, 60_000, 3, 120_000]);
    expect(result).toEqual({
      allowed: false,
      blockedUntil: new Date("2040-01-01T00:01:00.000Z"),
    });
    expect(Object.keys(result)).toEqual(["allowed", "blockedUntil"]);
  });

  it.each([
    ["bucketKey", { bucketKey: "raw-email@example.com" }],
    ["now", { now: new Date("invalid") }],
    ["windowMs", { windowMs: 0 }],
    ["windowMs", { windowMs: 1.5 }],
    ["maxAttempts", { maxAttempts: 0 }],
    ["blockMs", { blockMs: Number.POSITIVE_INFINITY }],
  ])("rejects invalid %s before issuing SQL", async (_label, override) => {
    let queried = false;
    const client = {
      query: async () => {
        queried = true;
        return { rows: [] };
      },
    };
    const { consumeAuthAttempt } = await import("./rate-limit-repository.js");

    await expect(consumeAuthAttempt(client, {
      bucketKey: "a".repeat(64),
      now: new Date("2040-01-01T00:00:00.000Z"),
      windowMs: 60_000,
      maxAttempts: 3,
      blockMs: 120_000,
      ...override,
    })).rejects.toThrow(TypeError);
    expect(queried).toBe(false);
  });
});
