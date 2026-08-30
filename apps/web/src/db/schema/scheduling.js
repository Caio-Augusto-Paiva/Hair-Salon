// @ts-nocheck
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  appointmentStatus,
  blockStatus,
  paymentMethod,
  scheduleKind,
  scheduleStatus,
} from "./enums.js";
import { employees, services } from "./catalog.js";
import { users } from "./identity.js";

export const scheduleEntries = pgTable(
  "schedule_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "restrict" }),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }).notNull(),
    kind: scheduleKind("kind").notNull(),
    status: scheduleStatus("status").default("ACTIVE").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    check("schedule_entries_valid_interval", sql`${table.endsAt} > ${table.startsAt}`),
    index("schedule_entries_employee_time_idx").on(table.employeeId, table.startsAt, table.endsAt),
    index("schedule_entries_active_idx").on(table.status, table.employeeId, table.startsAt),
  ],
);

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    scheduleEntryId: uuid("schedule_entry_id").notNull().references(() => scheduleEntries.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    serviceId: uuid("service_id").references(() => services.id, { onDelete: "set null" }),
    serviceNameSnapshot: text("service_name_snapshot").notNull(),
    durationMinutesSnapshot: integer("duration_minutes_snapshot").notNull(),
    priceCentsSnapshot: integer("price_cents_snapshot").notNull(),
    paymentMethod: paymentMethod("payment_method").default("CASH").notNull(),
    status: appointmentStatus("status").default("CONFIRMED").notNull(),
    cancellationReason: text("cancellation_reason"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "date" }),
    cancelledBy: uuid("cancelled_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("appointments_schedule_entry_unique").on(table.scheduleEntryId),
    check("appointments_duration_positive", sql`${table.durationMinutesSnapshot} > 0`),
    check("appointments_price_non_negative", sql`${table.priceCentsSnapshot} >= 0`),
    index("appointments_client_status_idx").on(table.clientId, table.status),
    index("appointments_status_idx").on(table.status),
  ],
);

export const scheduleBlocks = pgTable(
  "schedule_blocks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    scheduleEntryId: uuid("schedule_entry_id").notNull().references(() => scheduleEntries.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    recurrenceSource: text("recurrence_source"),
    status: blockStatus("status").default("ACTIVE").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("schedule_blocks_schedule_entry_unique").on(table.scheduleEntryId),
    index("schedule_blocks_status_idx").on(table.status),
  ],
);

export const cancellationCredits = pgTable(
  "cancellation_credits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: uuid("client_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    slotNumber: integer("slot_number").notNull(),
    availableAt: timestamp("available_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    lastAppointmentId: uuid("last_appointment_id").references(() => appointments.id, { onDelete: "set null" }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("cancellation_credits_client_slot_unique").on(table.clientId, table.slotNumber),
    check("cancellation_credits_slot_number", sql`${table.slotNumber} between 1 and 3`),
    index("cancellation_credits_available_idx").on(table.clientId, table.availableAt),
  ],
);
