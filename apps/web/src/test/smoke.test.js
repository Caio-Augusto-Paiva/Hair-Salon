import { describe, expect, it } from "vitest";
import { toBusinessDate } from "@/lib/time/business-time";

describe("test foundation", () => {
  it("converts an instant across the salon date boundary", () => {
    expect(toBusinessDate("2026-09-01T02:30:00.000Z")).toBe("2026-08-31");
  });

  it("rejects an invalid instant", () => {
    expect(() => toBusinessDate("invalid")).toThrow(RangeError);
  });
});
