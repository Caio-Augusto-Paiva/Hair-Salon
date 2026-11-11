// @ts-nocheck
import { describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";

vi.mock("server-only", () => ({}));

import { hashPassword } from "./password.js";

const password = randomBytes(32).toString("base64url");
const wrongPassword = randomBytes(32).toString("base64url");

function transactionPool(query) {
  const statements = [];
  const client = {
    query: async (text, values = []) => {
      statements.push([text, values]);
      return query(text, values);
    },
    release: vi.fn(),
  };
  return { pool: { connect: vi.fn().mockResolvedValue(client) }, statements, client };
}

describe("account repository boundaries", () => {
  it("creates only an active CLIENT with exactly three numbered credits and a signup event", async () => {
    const { pool, statements, client } = transactionPool(async (text) => {
      if (text === "begin" || text === "commit") return { rows: [] };
      if (text.includes("insert into users")) {
        return { rows: [{ id: "client-id", name: "Client A", email_normalized: "client-a@example.test", role: "CLIENT", status: "ACTIVE", session_version: 0 }] };
      }
      return { rows: [] };
    });
    const { createClientAccount } = await import("./account-repository.js");

    const result = await createClientAccount(pool, {
      name: "Client A",
      email: " CLIENT-A@EXAMPLE.TEST ",
      password,
      role: "ADMIN",
      status: "SUSPENDED",
    });

    expect(result).toEqual({
      id: "client-id",
      name: "Client A",
      emailNormalized: "client-a@example.test",
      role: "CLIENT",
      status: "ACTIVE",
      sessionVersion: 0,
    });
    expect(Object.keys(result)).not.toContain("passwordHash");
    expect(statements.map(([text]) => text)).toEqual(expect.arrayContaining([
      "begin",
      "commit",
    ]));
    const userInsert = statements.find(([text]) => text.includes("insert into users"));
    expect(userInsert[0]).toMatch(/'CLIENT'::user_role[\s\S]*'ACTIVE'::user_status/u);
    expect(userInsert[1][2]).toMatch(/^argon2id\$v=1\$m=65536,t=3,p=1\$/u);
    expect(userInsert[1]).not.toContain("ADMIN");
    expect(userInsert[1]).not.toContain("SUSPENDED");
    const credits = statements.find(([text]) => text.includes("insert into cancellation_credits"));
    expect(credits[0]).toMatch(/generate_series\(1, 3\)/u);
    expect(credits[1]).toEqual(["client-id"]);
    const event = statements.find(([text]) => text.includes("insert into auth_events"));
    expect(event[1]).toEqual(["client-id", "CLIENT_SIGNUP"]);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("translates only the named normalized-email unique constraint", async () => {
    const duplicate = Object.assign(new Error("duplicate"), {
      code: "23505",
      constraint: "users_email_normalized_unique",
    });
    const unrelated = Object.assign(new Error("other duplicate"), {
      code: "23505",
      constraint: "accounts_provider_identity_unique",
    });
    const { createClientAccount } = await import("./account-repository.js");

    for (const [failure, expected] of [[duplicate, "EMAIL_ALREADY_EXISTS"], [unrelated, unrelated]]) {
      const { pool, statements } = transactionPool(async (text) => {
        if (text === "begin" || text === "rollback") return { rows: [] };
        if (text.includes("insert into users")) throw failure;
        return { rows: [] };
      });
      const attempt = createClientAccount(pool, { name: "Client A", email: "client-a@example.test", password });
      if (typeof expected === "string") {
        await expect(attempt).rejects.toMatchObject({ code: expected });
      } else {
        await expect(attempt).rejects.toBe(expected);
      }
      expect(statements.map(([text]) => text)).toContain("rollback");
    }
  });

  it("returns one generic null result for missing users, missing hashes, wrong passwords, and inactive users", async () => {
    const validHash = await hashPassword(password);
    const scenarios = [
      null,
      { id: "client-id", password_hash: null, role: "CLIENT", status: "ACTIVE", session_version: 0 },
      { id: "client-id", password_hash: validHash, role: "CLIENT", status: "ACTIVE", session_version: 0 },
      { id: "client-id", password_hash: validHash, role: "CLIENT", status: "SUSPENDED", session_version: 0 },
    ];
    const { authenticateCredentials } = await import("./account-repository.js");

    const results = await Promise.all(scenarios.map(async (row, index) => {
      const pool = {
        query: vi.fn().mockResolvedValue({ rows: row ? [row] : [] }),
      };
      return authenticateCredentials(pool, {
        email: `client-${index}@example.test`,
        password: index === 2 ? wrongPassword : password,
      });
    }));

    expect(results).toEqual([null, null, null, null]);
  });

  it("locks the current active ADMIN and creates an employee detail without returning a hash", async () => {
    const { pool, statements } = transactionPool(async (text) => {
      if (text === "begin" || text === "commit") return { rows: [] };
      if (text.includes("from users") && text.includes("for update")) {
        return { rows: [{ id: "admin-id", role: "ADMIN", status: "ACTIVE", session_version: 7 }] };
      }
      if (text.includes("insert into users")) {
        return { rows: [{ id: "employee-user-id", name: "Staff A", email_normalized: "staff-a@example.test", role: "EMPLOYEE", status: "ACTIVE", session_version: 0 }] };
      }
      if (text.includes("insert into employees")) {
        return { rows: [{ id: "employee-id", user_id: "employee-user-id", display_name: "Staff A", specialty_summary: "Nails", status: "ACTIVE" }] };
      }
      return { rows: [] };
    });
    const { createEmployeeAccount } = await import("./account-repository.js");

    const result = await createEmployeeAccount(pool, {
      actor: { id: "admin-id", sessionVersion: 7 },
      name: "Staff A",
      email: "staff-a@example.test",
      password,
      displayName: "Staff A",
      specialtySummary: "Nails",
    });

    expect(result).toEqual({
      id: "employee-user-id",
      employeeId: "employee-id",
      name: "Staff A",
      emailNormalized: "staff-a@example.test",
      role: "EMPLOYEE",
      status: "ACTIVE",
      sessionVersion: 0,
      displayName: "Staff A",
      specialtySummary: "Nails",
    });
    expect(Object.keys(result)).not.toContain("passwordHash");
    expect(statements.find(([text]) => text.includes("from users") && text.includes("for update"))[1])
      .toEqual(["admin-id"]);
  });

  it.each([
    [{ id: "admin-id", role: "CLIENT", status: "ACTIVE", session_version: 3 }, { id: "admin-id", sessionVersion: 3 }],
    [{ id: "admin-id", role: "ADMIN", status: "SUSPENDED", session_version: 3 }, { id: "admin-id", sessionVersion: 3 }],
    [{ id: "admin-id", role: "ADMIN", status: "ACTIVE", session_version: 4 }, { id: "admin-id", sessionVersion: 3 }],
  ])("rejects stale or non-admin employee creators before any account write", async (actorRow, actor) => {
    const { pool, statements } = transactionPool(async (text) => {
      if (text === "begin" || text === "rollback" || text.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (text.includes("from users")) return { rows: [actorRow] };
      throw new Error("employee write must not run");
    });
    const { createEmployeeAccount } = await import("./account-repository.js");

    await expect(createEmployeeAccount(pool, {
      actor,
      name: "Staff A",
      email: "staff-a@example.test",
      password,
      displayName: "Staff A",
      specialtySummary: "Nails",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(statements.some(([text]) => text.includes("insert into users") || text.includes("insert into employees"))).toBe(false);
  });

  it("rejects an unverified Google e-mail before opening a transaction", async () => {
    const pool = { connect: vi.fn() };
    const { resolveGoogleAccount } = await import("./account-repository.js");

    await expect(resolveGoogleAccount(pool, {
      provider: "google",
      providerAccountId: "google-subject-a",
      email: "client-a@example.test",
      emailVerified: false,
      name: "Client A",
    })).rejects.toMatchObject({ code: "GOOGLE_EMAIL_UNVERIFIED" });
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("checks provider identity before e-mail and rejects a changed e-mail for that identity", async () => {
    const { pool, statements } = transactionPool(async (text) => {
      if (text === "begin" || text === "rollback" || text.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (text.includes("from accounts")) {
        return { rows: [{ id: "client-id", name: "Client A", email_normalized: "client-a@example.test", role: "CLIENT", status: "ACTIVE", session_version: 0 }] };
      }
      throw new Error("e-mail linking must not run");
    });
    const { resolveGoogleAccount } = await import("./account-repository.js");

    await expect(resolveGoogleAccount(pool, {
      provider: "google",
      providerAccountId: "google-subject-a",
      email: "other@example.test",
      emailVerified: true,
      name: "Client A",
    })).rejects.toMatchObject({ code: "GOOGLE_ACCOUNT_EMAIL_MISMATCH" });
    expect(statements.findIndex(([text]) => text.includes("from accounts"))).toBeGreaterThan(-1);
    expect(statements.some(([text]) => text.includes("insert into accounts"))).toBe(false);
  });

  it("preserves BEGIN and COMMIT errors when client release also fails", async () => {
    const { createClientAccount } = await import("./account-repository.js");
    const beginError = new Error("begin failure");
    const commitError = new Error("commit failure");
    const releaseError = new Error("release failure");

    for (const scenario of ["begin", "commit"]) {
      const client = {
        query: async (text) => {
          if (text === "begin" && scenario === "begin") throw beginError;
          if (text === "commit" && scenario === "commit") throw commitError;
          if (text.includes("insert into users")) {
            return { rows: [{ id: "client-id", name: "Client A", email_normalized: "client-a@example.test", role: "CLIENT", status: "ACTIVE", session_version: 0 }] };
          }
          return { rows: [] };
        },
        release: vi.fn(() => { throw releaseError; }),
      };
      await expect(createClientAccount({ connect: async () => client }, {
        name: "Client A", email: "client-a@example.test", password,
      })).rejects.toBe(scenario === "begin" ? beginError : commitError);
    }
  });

  it("destroys a client after rollback failure without masking the primary operation error", async () => {
    const { createClientAccount } = await import("./account-repository.js");
    const operationError = new Error("user insert failure");
    const rollbackError = new Error("rollback failure");
    const client = {
      query: async (text) => {
        if (text === "begin") return { rows: [] };
        if (text === "rollback") throw rollbackError;
        if (text.includes("insert into users")) throw operationError;
        return { rows: [] };
      },
      release: vi.fn(),
    };

    await expect(createClientAccount({ connect: async () => client }, {
      name: "Client A", email: "client-a@example.test", password,
    })).rejects.toBe(operationError);
    expect(client.release).toHaveBeenCalledWith(rollbackError);
  });

  it("surfaces a release failure when it is the only post-commit failure", async () => {
    const { createClientAccount } = await import("./account-repository.js");
    const releaseError = new Error("release failure");
    const client = {
      query: async (text) => {
        if (text.includes("insert into users")) {
          return { rows: [{ id: "client-id", name: "Client A", email_normalized: "client-a@example.test", role: "CLIENT", status: "ACTIVE", session_version: 0 }] };
        }
        return { rows: [] };
      },
      release: () => { throw releaseError; },
    };

    await expect(createClientAccount({ connect: async () => client }, {
      name: "Client A", email: "client-a@example.test", password,
    })).rejects.toBe(releaseError);
  });

  it("returns the exact public identity for valid active credentials", async () => {
    const passwordHash = await hashPassword(password);
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{
        id: "client-id",
        name: "Client A",
        email_normalized: "client-a@example.test",
        password_hash: passwordHash,
        role: "CLIENT",
        status: "ACTIVE",
        session_version: 2,
      }] }),
    };
    const { authenticateCredentials } = await import("./account-repository.js");

    const result = await authenticateCredentials(pool, { email: "client-a@example.test", password });

    expect(result).toEqual({
      id: "client-id",
      name: "Client A",
      emailNormalized: "client-a@example.test",
      role: "CLIENT",
      status: "ACTIVE",
      sessionVersion: 2,
    });
    expect(JSON.stringify(result)).not.toMatch(/password_hash|passwordHash/u);
  });

  it("readies the dummy hash before every credential lookup instead of deriving it for missing users", async () => {
    vi.resetModules();
    const events = [];
    const hashPasswordSpy = vi.fn(async () => {
      events.push("hash");
      return "dummy-hash";
    });
    const verifyPasswordSpy = vi.fn(async (_password, storedHash) => {
      events.push(`verify:${storedHash}`);
      return false;
    });
    vi.doMock("./password.js", () => ({ hashPassword: hashPasswordSpy, verifyPassword: verifyPasswordSpy }));
    try {
      const { authenticateCredentials } = await import("./account-repository.js");
      const missingPool = { query: async () => {
        events.push("query:missing");
        return { rows: [] };
      } };
      const existingPool = { query: async () => {
        events.push("query:existing");
        return { rows: [{
          id: "client-id", name: "Client A", email_normalized: "client-a@example.test",
          password_hash: "stored-hash", role: "CLIENT", status: "ACTIVE", session_version: 0,
        }] };
      } };

      await expect(authenticateCredentials(missingPool, { email: "missing@example.test", password })).resolves.toBeNull();
      await expect(authenticateCredentials(existingPool, { email: "client-a@example.test", password })).resolves.toBeNull();
      expect(events).toEqual([
        "hash",
        "query:missing",
        "verify:dummy-hash",
        "query:existing",
        "verify:stored-hash",
      ]);
      expect(hashPasswordSpy).toHaveBeenCalledOnce();
    } finally {
      vi.doUnmock("./password.js");
      vi.resetModules();
    }
  });

  it("does not hash credentials for nonexistent, stale, inactive, or non-admin employee actors", async () => {
    vi.resetModules();
    const hashPasswordSpy = vi.fn(async () => "dummy-hash");
    vi.doMock("./password.js", () => ({ hashPassword: hashPasswordSpy, verifyPassword: vi.fn() }));
    try {
      const { createEmployeeAccount } = await import("./account-repository.js");
      const actorRows = [
        null,
        { id: "admin-id", role: "ADMIN", status: "ACTIVE", session_version: 2 },
        { id: "admin-id", role: "ADMIN", status: "SUSPENDED", session_version: 1 },
        { id: "admin-id", role: "CLIENT", status: "ACTIVE", session_version: 1 },
      ];
      for (const actorRow of actorRows) {
        const client = {
          query: async (text) => {
            if (text.includes("from users")) return { rows: actorRow ? [actorRow] : [] };
            return { rows: [] };
          },
          release: vi.fn(),
        };
        await expect(createEmployeeAccount({ connect: async () => client }, {
          actor: { id: "admin-id", sessionVersion: 1 },
          name: "Staff A", email: "staff-a@example.test", password, displayName: "Staff A", specialtySummary: "Nails",
        })).rejects.toMatchObject({ code: "FORBIDDEN" });
      }
      expect(hashPasswordSpy).toHaveBeenCalledOnce();
    } finally {
      vi.doUnmock("./password.js");
      vi.resetModules();
    }
  });
});
