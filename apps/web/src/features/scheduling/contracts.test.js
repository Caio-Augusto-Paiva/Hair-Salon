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

const validAvailabilityQuery = {
  employeeId,
  serviceId,
  businessDate: "2026-09-01",
  timeZone: "America/Sao_Paulo",
};

const validSlot = {
  startsAt: "2026-09-01T12:00:00.000Z",
  endsAt: "2026-09-01T12:30:00.000Z",
  available: false,
  unavailableLabel: "Horário indisponível",
};

const validPublicAvailability = {
  ...validAvailabilityQuery,
  slots: [validSlot],
  nextAvailableStartsAt: null,
};

const validBooking = {
  employeeId,
  serviceId,
  startAt: "2026-09-01T12:00:00.000Z",
  paymentMethod: "PIX",
};

describe("scheduling contracts", () => {
  it("accepts a public unavailable slot without customer data", () => {
    expect(() => publicAvailabilitySchema.parse(validPublicAvailability)).not.toThrow();
  });

  it("rejects an invalid employee UUID in an availability query", () => {
    expect(() =>
      availabilityQuerySchema.parse({ ...validAvailabilityQuery, employeeId: "not-a-uuid" }),
    ).toThrow();
  });

  it("rejects an invalid service UUID in an availability query", () => {
    expect(() =>
      availabilityQuerySchema.parse({ ...validAvailabilityQuery, serviceId: "not-a-uuid" }),
    ).toThrow();
  });

  it("rejects a non-ISO business date in an availability query", () => {
    expect(() =>
      availabilityQuerySchema.parse({ ...validAvailabilityQuery, businessDate: "01/09/2026" }),
    ).toThrow();
  });

  it("rejects a time zone other than the salon time zone in an availability query", () => {
    expect(() =>
      availabilityQuerySchema.parse({ ...validAvailabilityQuery, timeZone: "UTC" }),
    ).toThrow();
  });

  it("rejects an extra field in an availability query", () => {
    expect(() =>
      availabilityQuerySchema.parse({ ...validAvailabilityQuery, extra: true }),
    ).toThrow();
  });

  it("rejects an extra field in public availability", () => {
    expect(() =>
      publicAvailabilitySchema.parse({ ...validPublicAvailability, extra: true }),
    ).toThrow();
  });

  it("rejects a client name nested in a public slot", () => {
    expect(() =>
      publicAvailabilitySchema.parse({
        ...validPublicAvailability,
        slots: [{ ...validSlot, clientName: "Dado proibido" }],
      }),
    ).toThrow();
  });

  it("rejects an email nested in a public slot", () => {
    expect(() =>
      publicAvailabilitySchema.parse({
        ...validPublicAvailability,
        slots: [{ ...validSlot, email: "cliente@example.com" }],
      }),
    ).toThrow();
  });

  it("rejects private service details nested in a public slot", () => {
    expect(() =>
      publicAvailabilitySchema.parse({
        ...validPublicAvailability,
        slots: [{ ...validSlot, serviceName: "Serviço privado" }],
      }),
    ).toThrow();
  });

  it("rejects an extra field nested in a public slot", () => {
    expect(() =>
      publicAvailabilitySchema.parse({
        ...validPublicAvailability,
        slots: [{ ...validSlot, extra: true }],
      }),
    ).toThrow();
  });

  it("rejects a malformed slot start instant", () => {
    expect(() =>
      publicAvailabilitySchema.parse({
        ...validPublicAvailability,
        slots: [{ ...validSlot, startsAt: "2026-09-01 12:00:00" }],
      }),
    ).toThrow();
  });

  it("rejects a malformed slot end instant", () => {
    expect(() =>
      publicAvailabilitySchema.parse({
        ...validPublicAvailability,
        slots: [{ ...validSlot, endsAt: "2026-09-01 12:30:00" }],
      }),
    ).toThrow();
  });

  it.each(["CASH", "PIX", "CARD"])("accepts the %s payment method for booking", (paymentMethod) => {
    expect(() => bookingInputSchema.parse({ ...validBooking, paymentMethod })).not.toThrow();
  });

  it("rejects a malformed booking start instant", () => {
    expect(() =>
      bookingInputSchema.parse({ ...validBooking, startAt: "2026-09-01 12:00:00" }),
    ).toThrow();
  });

  it("rejects a payment method outside CASH, PIX, and CARD", () => {
    expect(() =>
      bookingInputSchema.parse({ ...validBooking, paymentMethod: "TRANSFER" }),
    ).toThrow();
  });

  it("rejects an extra field in booking input", () => {
    expect(() => bookingInputSchema.parse({ ...validBooking, extra: true })).toThrow();
  });

  it("accepts only the appointment identifier for cancellation", () => {
    expect(() => cancellationInputSchema.parse({ appointmentId })).not.toThrow();
    expect(() =>
      cancellationInputSchema.parse({ appointmentId, clientName: "Dado proibido" }),
    ).toThrow();
  });
});
