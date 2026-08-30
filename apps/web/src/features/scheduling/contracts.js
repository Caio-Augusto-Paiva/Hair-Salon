import { z } from "zod";

import { BUSINESS_TIME_ZONE } from "@/lib/time/business-time";

const identifierSchema = z.string().uuid();
const isoInstantSchema = z.iso.datetime({ offset: true });

export const availabilityQuerySchema = z.strictObject({
  employeeId: identifierSchema,
  serviceId: identifierSchema,
  businessDate: z.iso.date(),
  timeZone: z.literal(BUSINESS_TIME_ZONE),
});

const publicSlotSchema = z.strictObject({
  startsAt: isoInstantSchema,
  endsAt: isoInstantSchema,
  available: z.boolean(),
  unavailableLabel: z.literal("Horário indisponível"),
});

export const publicAvailabilitySchema = z.strictObject({
  employeeId: identifierSchema,
  serviceId: identifierSchema,
  businessDate: z.iso.date(),
  timeZone: z.literal(BUSINESS_TIME_ZONE),
  slots: z.array(publicSlotSchema),
  nextAvailableStartsAt: isoInstantSchema.nullable(),
});

export const bookingInputSchema = z.strictObject({
  employeeId: identifierSchema,
  serviceId: identifierSchema,
  startAt: isoInstantSchema,
  paymentMethod: z.enum(["CASH", "PIX", "CARD"]),
});

export const cancellationInputSchema = z.strictObject({
  appointmentId: identifierSchema,
});
