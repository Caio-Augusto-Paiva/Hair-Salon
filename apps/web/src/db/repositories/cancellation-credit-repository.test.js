// @ts-nocheck
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("cancellation credit repository boundaries", () => {
  it("locks eligible rows in slot order and writes a database-calculated 30-day renewal", async () => {
    const calls = [];
    const transaction = {
      release: () => {},
      query: async (text, values) => {
        calls.push([text, values]);
        if (text.includes("select id, slot_number")) {
          return { rows: [{ id: "credit-1", slot_number: 1 }] };
        }
        return {
          rows: [{
            id: "credit-1",
            slot_number: 1,
            available_at: new Date("2040-06-01T00:00:00.000Z"),
            last_used_at: new Date("2040-05-02T00:00:00.000Z"),
          }],
        };
      },
    };
    const { claimCancellationCredit } = await import("./cancellation-credit-repository.js");
    const result = await claimCancellationCredit(transaction, {
      clientId: "client-id",
      appointmentId: "appointment-id",
      now: new Date("2040-05-02T00:00:00.000Z"),
    });

    expect(result).toMatchObject({ ok: true, slotNumber: 1, creditId: "credit-1" });
    expect(calls[0][0]).toMatch(/order by slot_number[\s\S]*for update/u);
    expect(calls[1][0]).toContain("$2::timestamptz + interval '30 days'");
    expect(calls[1][1]).toEqual([
      "credit-1",
      new Date("2040-05-02T00:00:00.000Z"),
      "appointment-id",
    ]);
  });

  it("returns every renewal instant without exposing client records when exhausted", async () => {
    const transaction = {
      release: () => {},
      query: async (text) => {
        if (text.includes("select id, slot_number")) return { rows: [] };
        return {
          rows: [
            { available_at: new Date("2040-06-01T00:00:00.000Z") },
            { available_at: new Date("2040-06-02T00:00:00.000Z") },
            { available_at: new Date("2040-06-03T00:00:00.000Z") },
          ],
        };
      },
    };
    const { claimCancellationCredit } = await import("./cancellation-credit-repository.js");
    const result = await claimCancellationCredit(transaction, {
      clientId: "client-id",
      now: new Date("2040-05-02T00:00:00.000Z"),
    });

    expect(result).toEqual({
      ok: false,
      code: "NO_CANCELLATION_CREDIT",
      renewalInstants: [
        new Date("2040-06-01T00:00:00.000Z"),
        new Date("2040-06-02T00:00:00.000Z"),
        new Date("2040-06-03T00:00:00.000Z"),
      ],
    });
  });

  it("rejects a pg Pool instead of querying outside a transaction", async () => {
    const poolLike = { query: async () => ({ rows: [] }), connect: async () => ({}) };
    const { claimCancellationCredit } = await import("./cancellation-credit-repository.js");

    await expect(claimCancellationCredit(poolLike, { clientId: "client-id" }))
      .rejects.toThrow(/transaction-bound.*Pool/u);
  });

  it("rejects execute-only root Drizzle databases without executing SQL", async () => {
    let executed = false;
    const rootDatabaseLike = {
      execute: async () => {
        executed = true;
        return { rows: [] };
      },
    };
    const { claimCancellationCredit } = await import("./cancellation-credit-repository.js");

    await expect(claimCancellationCredit(rootDatabaseLike, { clientId: "client-id" }))
      .rejects.toThrow(/transaction-bound/u);
    expect(executed).toBe(false);
  });

  it("accepts a Drizzle transaction with rollback and keeps values parameterized", async () => {
    const statements = [];
    const transactionLike = {
      rollback: () => { throw new Error("rollback is only a transaction marker"); },
      execute: async (statement) => {
        statements.push(statement);
        if (statements.length === 1) {
          return { rows: [{ id: "credit-id", slot_number: 1 }] };
        }
        return {
          rows: [{
            id: "credit-id",
            slot_number: 1,
            available_at: new Date("2040-06-01T00:00:00.000Z"),
            last_used_at: new Date("2040-05-02T00:00:00.000Z"),
          }],
        };
      },
    };
    const { claimCancellationCredit } = await import("./cancellation-credit-repository.js");
    const result = await claimCancellationCredit(transactionLike, {
      clientId: "client-id",
      appointmentId: "appointment-id",
      now: new Date("2040-05-02T00:00:00.000Z"),
    });

    expect(result).toMatchObject({ ok: true, slotNumber: 1 });
    expect(JSON.stringify(statements[0].queryChunks)).toContain("client-id");
    expect(JSON.stringify(statements[0].queryChunks)).toContain("2040-05-02T00:00:00.000Z");
  });
});
