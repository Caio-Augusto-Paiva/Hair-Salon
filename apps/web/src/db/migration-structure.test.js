import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "drizzle/0001_proveras_initial.sql"), "utf8");
const integrationTest = readFileSync(resolve(process.cwd(), "src/db/migrations.integration.test.js"), "utf8");

describe("migration safety boundaries", () => {
  it("locks the parent and validates both references in the detail trigger", () => {
    expect(migration).toMatch(/PERFORM 1 FROM "schedule_entries"[\s\S]+FOR UPDATE/);
    expect(migration).toMatch(/old_entry_id/);
    expect(migration).toMatch(/new_entry_id/);
  });

  it("does not use PostgreSQL's invalid RETURNING ... ORDER BY form", () => {
    expect(integrationTest).not.toMatch(/returning\s+id\s+order\s+by/i);
  });

  it("uses an explicit barrier before concurrent detail commits", () => {
    expect(integrationTest).toMatch(/bothInserted/);
    expect(integrationTest).toMatch(/Promise\.allSettled\(\[insertAppointment\(\), insertBlock\(\)\]\)/);
  });
});
