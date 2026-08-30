// @ts-nocheck
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { employeeStatus, serviceCategory } from "./enums.js";
import { users } from "./identity.js";

export const employees = pgTable(
  "employees",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    displayName: text("display_name").notNull(),
    specialtySummary: text("specialty_summary").notNull(),
    status: employeeStatus("status").default("ACTIVE").notNull(),
    calendarId: text("calendar_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("employees_user_unique").on(table.userId),
    index("employees_status_idx").on(table.status),
  ],
);

export const services = pgTable(
  "services",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    category: serviceCategory("category").default("OTHER").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    preparationMinutes: integer("preparation_minutes").default(0).notNull(),
    priceCents: integer("price_cents").notNull(),
    priceVerifiedAt: timestamp("price_verified_at", { withTimezone: true, mode: "date" }),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    check("services_duration_positive", sql`${table.durationMinutes} > 0`),
    check("services_preparation_non_negative", sql`${table.preparationMinutes} >= 0`),
    check("services_price_non_negative", sql`${table.priceCents} >= 0`),
    index("services_active_idx").on(table.active),
  ],
);

export const employeeServices = pgTable(
  "employee_services",
  {
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
    durationOverrideMinutes: integer("duration_override_minutes"),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.employeeId, table.serviceId], name: "employee_services_pk" }),
    check("employee_services_duration_positive", sql`${table.durationOverrideMinutes} is null or ${table.durationOverrideMinutes} > 0`),
    index("employee_services_enabled_idx").on(table.employeeId, table.enabled),
  ],
);

export const portfolioItems = pgTable(
  "portfolio_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    assetPath: text("asset_path").notNull(),
    category: serviceCategory("category").default("OTHER").notNull(),
    alternativeText: text("alternative_text").notNull(),
    displayOrder: integer("display_order").default(0).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("portfolio_items_asset_path_unique").on(table.assetPath),
    index("portfolio_items_active_order_idx").on(table.active, table.displayOrder),
  ],
);
