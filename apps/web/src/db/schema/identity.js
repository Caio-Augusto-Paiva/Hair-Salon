// @ts-nocheck
import { sql } from "drizzle-orm";
import {
  boolean,
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
import { userRole, userStatus } from "./enums.js";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    emailNormalized: text("email_normalized").notNull(),
    passwordHash: text("password_hash"),
    role: userRole("role").default("CLIENT").notNull(),
    status: userStatus("status").default("ACTIVE").notNull(),
    sessionVersion: integer("session_version").default(0).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("users_email_normalized_unique").on(table.emailNormalized),
    index("users_role_status_idx").on(table.role, table.status),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refreshToken: text("refresh_token"),
    accessToken: text("access_token"),
    expiresAt: integer("expires_at"),
    tokenType: text("token_type"),
    scope: text("scope"),
    idToken: text("id_token"),
    sessionState: text("session_state"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("accounts_provider_identity_unique").on(table.provider, table.providerAccountId),
    index("accounts_user_idx").on(table.userId),
  ],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "date" }),
    createdIpHash: text("created_ip_hash"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("password_reset_tokens_hash_unique").on(table.tokenHash),
    index("password_reset_tokens_user_idx").on(table.userId),
  ],
);

export const authEvents = pgTable(
  "auth_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    successful: boolean("successful").default(false).notNull(),
    metadata: jsonb("metadata").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("auth_events_user_created_idx").on(table.userId, table.createdAt),
  ],
);

export const authRateLimits = pgTable(
  "auth_rate_limits",
  {
    bucketKey: text("bucket_key").primaryKey(),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true, mode: "date" }).notNull(),
    attempts: integer("attempts").default(0).notNull(),
    blockedUntil: timestamp("blocked_until", { withTimezone: true, mode: "date" }),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    check("auth_rate_limits_bucket_key_format", sql`${table.bucketKey} ~ '^[0-9a-f]{64}$'`),
    check("auth_rate_limits_attempts_non_negative", sql`${table.attempts} >= 0`),
    check(
      "auth_rate_limits_blocked_after_window",
      sql`${table.blockedUntil} is null or ${table.blockedUntil} > ${table.windowStartedAt}`,
    ),
    index("auth_rate_limits_expiry_idx").on(table.blockedUntil),
  ],
);
