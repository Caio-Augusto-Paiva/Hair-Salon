// @ts-nocheck
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const now = new Date("2040-01-01T00:00:00.000Z");
const validClaim = { sub: "user-id", role: "CLIENT", sessionVersion: 3, exp: 2_209_018_400 };

function poolFor(row) {
  return { query: vi.fn(async () => ({ rows: row ? [row] : [] })) };
}

describe("current-state authorization guards", () => {
  // Mutation caught: requiring callers to rebuild a JWT-shaped claim from Auth.js session output loses expiry validation or trusts malformed session data.
  it("accepts the minimized Auth.js session directly and maps its ISO expiry securely", async () => {
    const { requireCurrentUser, requireRole } = await import("./session.js");
    const session = {
      user: { id: "user-id", role: "CLIENT", sessionVersion: 3 },
      expires: "2040-01-01T01:00:00.000Z",
    };
    const row = { id: "user-id", role: "CLIENT", status: "ACTIVE", session_version: 3 };

    await expect(requireCurrentUser(poolFor(row), session, { now })).resolves.toEqual({
      id: "user-id", role: "CLIENT", status: "ACTIVE", sessionVersion: 3,
    });
    await expect(requireRole(poolFor(row), session, "CLIENT", { now })).resolves.toEqual({
      id: "user-id", role: "CLIENT", status: "ACTIVE", sessionVersion: 3,
    });
  });

  // Mutation caught: accepting invalid or expired Auth.js `expires` values turns a public session object into a permanent credential.
  it.each([
    ["missing user", { expires: "2040-01-01T01:00:00.000Z" }],
    ["missing identifier", { user: { role: "CLIENT", sessionVersion: 3 }, expires: "2040-01-01T01:00:00.000Z" }],
    ["malformed expiry", { user: { id: "user-id", role: "CLIENT", sessionVersion: 3 }, expires: "not-a-date" }],
    ["expired session", { user: { id: "user-id", role: "CLIENT", sessionVersion: 3 }, expires: "2039-12-31T23:59:59.999Z" }],
  ])("rejects an Auth.js session with %s", async (_label, session) => {
    const { requireCurrentUser } = await import("./session.js");

    await expect(requireCurrentUser(poolFor({ id: "user-id", role: "CLIENT", status: "ACTIVE", session_version: 3 }), session, { now }))
      .rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  // Mutation caught: returning a claim without a database lookup lets disabled accounts retain access.
  it("loads the current database identity for each protected access", async () => {
    const { loadCurrentIdentity } = await import("./session.js");
    const pool = poolFor({ id: "user-id", role: "CLIENT", status: "ACTIVE", session_version: 3 });

    const identity = await loadCurrentIdentity(pool, validClaim);

    expect(identity).toEqual({ id: "user-id", role: "CLIENT", status: "ACTIVE", sessionVersion: 3 });
    expect(pool.query).toHaveBeenCalledWith(expect.stringMatching(/from users/iu), ["user-id"]);
  });

  // Mutation caught: accepting expired/malformed/missing claims treats untrusted session data as authentication.
  it.each([
    ["missing", null],
    ["missing subject", { role: "CLIENT", sessionVersion: 3, exp: 2_209_018_400 }],
    ["invalid role", { ...validClaim, role: "OWNER" }],
    ["invalid version", { ...validClaim, sessionVersion: -1 }],
    ["expired", { ...validClaim, exp: 1 }],
  ])("rejects %s session claims before authorizing", async (_label, claim) => {
    const { requireCurrentUser } = await import("./session.js");
    const pool = poolFor({ id: "user-id", role: "CLIENT", status: "ACTIVE", session_version: 3 });

    await expect(requireCurrentUser(pool, claim, { now })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  // Mutation caught: checking only ACTIVE status permits deleted/suspended accounts, stale role claims, or revoked session versions.
  it.each([
    ["missing account", null, validClaim],
    ["suspended account", { id: "user-id", role: "CLIENT", status: "SUSPENDED", session_version: 3 }, validClaim],
    ["deleted account", { id: "user-id", role: "CLIENT", status: "DELETED", session_version: 3 }, validClaim],
    ["role-changed account", { id: "user-id", role: "EMPLOYEE", status: "ACTIVE", session_version: 3 }, validClaim],
    ["session-revoked account", { id: "user-id", role: "CLIENT", status: "ACTIVE", session_version: 4 }, validClaim],
  ])("rejects a %s despite an otherwise valid JWT", async (_label, row, claim) => {
    const { requireCurrentUser } = await import("./session.js");

    await expect(requireCurrentUser(poolFor(row), claim, { now })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  // Mutation caught: using an `at least` or token-only role check grants roles that the current row does not have.
  it("enforces exact current CLIENT, EMPLOYEE, and ADMIN role policies", async () => {
    const { requireRole } = await import("./session.js");
    for (const role of ["CLIENT", "EMPLOYEE", "ADMIN"]) {
      const claim = { ...validClaim, role };
      const row = { id: "user-id", role, status: "ACTIVE", session_version: 3 };
      await expect(requireRole(poolFor(row), claim, role, { now })).resolves.toEqual({
        id: "user-id", role, status: "ACTIVE", sessionVersion: 3,
      });
      const anotherRole = role === "CLIENT" ? "EMPLOYEE" : "CLIENT";
      await expect(requireRole(poolFor(row), claim, anotherRole, { now })).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });
});
