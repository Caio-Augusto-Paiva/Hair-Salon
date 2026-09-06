// @ts-nocheck
import { describe, expect, it } from "vitest";
import { startTestDatabase, stopTestDatabase } from "../../db/test-database.js";

const unexpiredSession = (id, role = "CLIENT", sessionVersion = 0) => ({
  user: { id, role, sessionVersion },
  expires: "2040-01-01T01:00:00.000Z",
});

describe("current-state session guards with PostgreSQL 17", () => {
  // Mutation caught: trusting a still-unexpired JWT after an account disable, role change, or session revocation.
  it("invalidates otherwise unexpired identities after current-state changes", async () => {
    const database = await startTestDatabase();
    try {
      const { runMigrations } = await import("../../db/migrate.js");
      const { requireCurrentUser } = await import("./session.js");
      await runMigrations(database.connectionString);

      const inserted = await database.pool.query(
        `insert into users (name, email_normalized, role, status, session_version)
         values ('Session Client', 'session-client@example.test', 'CLIENT', 'ACTIVE', 0)
         returning id`,
      );
      const id = inserted.rows[0].id;
      const session = unexpiredSession(id);

      await expect(requireCurrentUser(database.pool, session)).resolves.toMatchObject({ id, role: "CLIENT" });

      await database.pool.query("update users set status = 'SUSPENDED' where id = $1", [id]);
      await expect(requireCurrentUser(database.pool, session)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });

      await database.pool.query("update users set status = 'ACTIVE', role = 'EMPLOYEE' where id = $1", [id]);
      await expect(requireCurrentUser(database.pool, session)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });

      await database.pool.query("update users set role = 'CLIENT', session_version = 1 where id = $1", [id]);
      await expect(requireCurrentUser(database.pool, session)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    } finally {
      await stopTestDatabase(database);
    }
  });
});
