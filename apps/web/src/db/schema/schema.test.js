// @ts-nocheck
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import * as schema from "./index.js";

const tableNames = [
  "users",
  "accounts",
  "passwordResetTokens",
  "authEvents",
  "employees",
  "services",
  "employeeServices",
  "portfolioItems",
  "scheduleEntries",
  "appointments",
  "scheduleBlocks",
  "cancellationCredits",
  "integrationOutbox",
  "calendarSyncs",
  "reminderDeliveries",
  "privacyRequests",
  "auditLog",
];

describe("Proveras relational schema", () => {
  it("exports every approved table by its domain name", () => {
    expect(Object.keys(schema).sort()).toEqual(tableNames.sort());
  });

  it("uses unique normalized email and OAuth account identity", () => {
    const usersConfig = getTableConfig(schema.users);
    const accountsConfig = getTableConfig(schema.accounts);
    const userColumns = Object.values(usersConfig.columns);

    expect(userColumns.some((column) => column.name === "email_normalized")).toBe(true);
    expect(usersConfig.indexes.some((index) =>
      index.config.unique && index.config.columns.some((column) => column.name === "email_normalized"),
    )).toBe(true);
    expect(accountsConfig.indexes.some((index) =>
      index.config.unique && index.config.columns.map((column) => column.name).sort().join(",") ===
      "provider,provider_account_id",
    )).toBe(true);
  });

  it("declares scheduling instants with timezone and the required checks", () => {
    const scheduleConfig = getTableConfig(schema.scheduleEntries);
    const scheduleColumns = Object.values(scheduleConfig.columns);
    expect(scheduleColumns.find((column) => column.name === "starts_at").dataType).toBe("date");
    expect(scheduleColumns.find((column) => column.name === "ends_at").dataType).toBe("date");
    expect(scheduleConfig.checks.map((check) => check.name)).toContain(
      "schedule_entries_valid_interval",
    );
    expect(getTableConfig(schema.services).checks.map((check) => check.name)).toEqual(
      expect.arrayContaining(["services_duration_positive", "services_price_non_negative"]),
    );
  });

  it("enforces one detail row per schedule entry and idempotent outbox events", () => {
    expect(getTableConfig(schema.appointments).indexes.some((index) =>
      index.config.unique && index.config.columns.length === 1 && index.config.columns[0].name === "schedule_entry_id",
    )).toBe(true);
    expect(getTableConfig(schema.scheduleBlocks).indexes.some((index) =>
      index.config.unique && index.config.columns.length === 1 && index.config.columns[0].name === "schedule_entry_id",
    )).toBe(true);
    expect(getTableConfig(schema.integrationOutbox).indexes.some((index) =>
      index.config.unique && index.config.columns.length === 1 && index.config.columns[0].name === "idempotency_key",
    )).toBe(true);
  });
});
