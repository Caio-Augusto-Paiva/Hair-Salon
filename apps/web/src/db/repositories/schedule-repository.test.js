// @ts-nocheck
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("schedule repository boundaries", () => {
  it("returns the inserted collision row", async () => {
    const transaction = {
      query: async () => ({
        rows: [{
          id: "entry-id",
          employee_id: "employee-id",
          starts_at: new Date("2040-07-01T10:00:00.000Z"),
          ends_at: new Date("2040-07-01T11:00:00.000Z"),
          kind: "APPOINTMENT",
          status: "ACTIVE",
        }],
      }),
    };
    const { insertActiveScheduleEntry } = await import("./schedule-repository.js");
    await expect(insertActiveScheduleEntry(transaction, {
      employeeId: "employee-id",
      startsAt: "2040-07-01T10:00:00.000Z",
      endsAt: "2040-07-01T11:00:00.000Z",
      kind: "APPOINTMENT",
    })).resolves.toMatchObject({ id: "entry-id", status: "ACTIVE" });
  });

  it("translates only the named PostgreSQL exclusion constraint", async () => {
    const namedExclusion = Object.assign(new Error("conflict"), {
      code: "23P01",
      constraint: "schedule_entries_no_employee_overlap",
    });
    const otherExclusion = Object.assign(new Error("other conflict"), {
      code: "23P01",
      constraint: "another_exclusion_constraint",
    });
    const { insertActiveScheduleEntry } = await import("./schedule-repository.js");
    const input = {
      employeeId: "employee-id",
      startsAt: "2040-07-01T10:00:00.000Z",
      endsAt: "2040-07-01T11:00:00.000Z",
      kind: "APPOINTMENT",
    };

    await expect(insertActiveScheduleEntry({ query: async () => { throw namedExclusion; } }, input))
      .rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
    await expect(insertActiveScheduleEntry({ query: async () => { throw otherExclusion; } }, input))
      .rejects.toBe(otherExclusion);
  });
});
