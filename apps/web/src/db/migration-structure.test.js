import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const integrationTest = readFileSync(resolve(process.cwd(), "src/db/migrations.integration.test.js"), "utf8");

describe("migration safety boundaries", () => {
  it("does not use PostgreSQL's invalid RETURNING ... ORDER BY form", () => {
    expect(integrationTest).not.toMatch(/returning\s+id\s+order\s+by/i);
  });

  it("uses an explicit barrier before concurrent detail commits", () => {
    expect(integrationTest).toMatch(/bothInserted/);
    expect(integrationTest).toMatch(/Promise\.allSettled\(\[insertAppointment\(\), insertBlock\(\)\]\)/);
  });
});
