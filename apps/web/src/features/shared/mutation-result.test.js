import { describe, expect, it } from "vitest";

import { failureResult, successResult } from "@/features/shared/mutation-result";

describe("mutation results", () => {
  it("returns the stable success shape for a booking confirmation", () => {
    expect(successResult("BOOKING_CREATED", { appointmentId: "a-123" })).toEqual({
      ok: true,
      code: "BOOKING_CREATED",
      data: { appointmentId: "a-123" },
      fieldErrors: {},
      formError: null,
    });
  });

  it("returns the stable failure shape without exposing data", () => {
    expect(
      failureResult("BOOKING_SLOT_UNAVAILABLE", {
        startAt: ["Horário indisponível"],
      }, "Escolha outro horário."),
    ).toEqual({
      ok: false,
      code: "BOOKING_SLOT_UNAVAILABLE",
      data: {},
      fieldErrors: { startAt: ["Horário indisponível"] },
      formError: "Escolha outro horário.",
    });
  });
});
