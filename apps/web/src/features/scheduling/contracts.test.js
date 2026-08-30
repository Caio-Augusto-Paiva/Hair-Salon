import { describe, expect, it } from "vitest";

import {
  availabilityQuerySchema,
  bookingInputSchema,
  cancellationInputSchema,
  publicAvailabilitySchema,
} from "@/features/scheduling/contracts";

const employeeId = "11111111-1111-4111-8111-111111111111";
const serviceId = "22222222-2222-4222-8222-222222222222";
const appointmentId = "33333333-3333-4333-8333-333333333333";

describe("scheduling contracts", () => {
  it("accepts a public unavailable slot without customer data", () => {
    expect(() =>
      publicAvailabilitySchema.parse({
        employeeId,
        serviceId,
        businessDate: "2026-09-01",
        timeZone: "America/Sao_Paulo",
        slots: [
          {
            startsAt: "2026-09-01T12:00:00.000Z",
            endsAt: "2026-09-01T12:30:00.000Z",
            available: false,
            unavailableLabel: "Horário indisponível",
          },
        ],
        nextAvailableStartsAt: null,
      }),
    ).not.toThrow();
  });

  it("rejects customer and private service data nested in a public slot", () => {
    expect(() =>
      publicAvailabilitySchema.parse({
        employeeId,
        serviceId,
        businessDate: "2026-09-01",
        timeZone: "America/Sao_Paulo",
        slots: [
          {
            startsAt: "2026-09-01T12:00:00.000Z",
            endsAt: "2026-09-01T12:30:00.000Z",
            available: false,
            unavailableLabel: "Horário indisponível",
            clientName: "Dado proibido",
            email: "cliente@example.com",
            serviceName: "Serviço privado",
          },
        ],
        nextAvailableStartsAt: null,
      }),
    ).toThrow();
  });

  it("rejects private email from public availability", () => {
    expect(() =>
      publicAvailabilitySchema.parse({
        employeeId,
        serviceId,
        businessDate: "2026-09-01",
        timeZone: "America/Sao_Paulo",
        slots: [],
        nextAvailableStartsAt: null,
        email: "cliente@example.com",
      }),
    ).toThrow();
  });

  it("requires valid query identifiers, a business date, and the salon time zone", () => {
    expect(() =>
      availabilityQuerySchema.parse({
        employeeId: "not-a-uuid",
        serviceId,
        businessDate: "01/09/2026",
        timeZone: "UTC",
        extra: true,
      }),
    ).toThrow();
  });

  it("accepts only an ISO instant and supported payment methods for booking", () => {
    for (const paymentMethod of ["CASH", "PIX", "CARD"]) {
      expect(() =>
        bookingInputSchema.parse({
          employeeId,
          serviceId,
          startAt: "2026-09-01T12:00:00.000Z",
          paymentMethod,
        }),
      ).not.toThrow();
    }

    expect(() =>
      bookingInputSchema.parse({
        employeeId,
        serviceId,
        startAt: "2026-09-01 12:00:00",
        paymentMethod: "TRANSFER",
      }),
    ).toThrow();
  });

  it("accepts only the appointment identifier for cancellation", () => {
    expect(() => cancellationInputSchema.parse({ appointmentId })).not.toThrow();
    expect(() =>
      cancellationInputSchema.parse({ appointmentId, clientName: "Dado proibido" }),
    ).toThrow();
  });
});
