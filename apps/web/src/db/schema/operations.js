// @ts-nocheck
import {
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
  calendarSyncStatus,
  outboxStatus,
  privacyRequestStatus,
  privacyRequestType,
  reminderChannel,
  reminderStatus,
} from "./enums.js";
import { appointments } from "./scheduling.js";
import { users } from "./identity.js";

export const integrationOutbox = pgTable(
  "integration_outbox",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventType: text("event_type").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    payload: jsonb("payload").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    status: outboxStatus("status").default("PENDING").notNull(),
    lastError: text("last_error"),
    processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("integration_outbox_idempotency_unique").on(table.idempotencyKey),
    index("integration_outbox_pending_idx").on(table.status, table.nextAttemptAt),
  ],
);

export const calendarSyncs = pgTable(
  "calendar_syncs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    appointmentId: uuid("appointment_id").notNull().references(() => appointments.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    externalEventId: text("external_event_id"),
    status: calendarSyncStatus("status").default("PENDING").notNull(),
    lastProviderOutcome: text("last_provider_outcome"),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true, mode: "date" }),
    syncedAt: timestamp("synced_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("calendar_syncs_appointment_provider_unique").on(table.appointmentId, table.provider),
    uniqueIndex("calendar_syncs_external_event_unique").on(table.provider, table.externalEventId),
    index("calendar_syncs_status_idx").on(table.status),
  ],
);

export const reminderDeliveries = pgTable(
  "reminder_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    appointmentId: uuid("appointment_id").notNull().references(() => appointments.id, { onDelete: "cascade" }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true, mode: "date" }).notNull(),
    channel: reminderChannel("channel").notNull(),
    status: reminderStatus("status").default("PENDING").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("reminder_deliveries_idempotency_unique").on(table.idempotencyKey),
    index("reminder_deliveries_pending_idx").on(table.status, table.scheduledAt),
  ],
);

export const privacyRequests = pgTable(
  "privacy_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    protocol: text("protocol").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    contactEmail: text("contact_email").notNull(),
    requestType: privacyRequestType("request_type").notNull(),
    status: privacyRequestStatus("status").default("RECEIVED").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true, mode: "date" }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
    resolutionNotes: text("resolution_notes"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("privacy_requests_protocol_unique").on(table.protocol),
    index("privacy_requests_status_due_idx").on(table.status, table.dueAt),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    metadata: jsonb("metadata").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_log_target_idx").on(table.targetType, table.targetId),
    index("audit_log_actor_created_idx").on(table.actorUserId, table.createdAt),
  ],
);
