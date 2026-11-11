import { describe, expect, it } from "vitest";

import {
  credentialsInputSchema,
  normalizeEmail,
  passwordResetConsumeSchema,
  passwordResetRequestSchema,
  signupInputSchema,
} from "@/features/auth/contracts";
import { failureResult, successResult } from "@/features/shared/mutation-result";

const validPassword = "safe-test-password";

describe("identity contracts", () => {
  it("trims the signup name and normalizes the email address", () => {
    expect(
      signupInputSchema.parse({
        name: "  Ana  ",
        email: "  ANA@EXAMPLE.COM  ",
        password: validPassword,
      }),
    ).toEqual({
      name: "Ana",
      email: "ana@example.com",
      password: validPassword,
    });
    expect(normalizeEmail("  ANA@EXAMPLE.COM  ")).toBe("ana@example.com");
  });

  it("accepts an email address with an @...com domain", () => {
    expect(() =>
      credentialsInputSchema.parse({ email: "client@example.com", password: validPassword }),
    ).not.toThrow();
  });

  it.each(["12345678", "a".repeat(128)])("accepts a password at the %s length boundary", (password) => {
    expect(() => signupInputSchema.parse({ name: "Ana", email: "ana@example.com", password })).not.toThrow();
  });

  it.each(["1234567", "a".repeat(129)])("rejects a password outside the allowed length", (password) => {
    expect(() => signupInputSchema.parse({ name: "Ana", email: "ana@example.com", password })).toThrow();
  });

  it("rejects unknown keys in every identity input", () => {
    expect(() =>
      signupInputSchema.parse({ name: "Ana", email: "ana@example.com", password: validPassword, role: "ADMIN" }),
    ).toThrow();
    expect(() =>
      credentialsInputSchema.parse({ email: "ana@example.com", password: validPassword, redirectTo: "/admin" }),
    ).toThrow();
    expect(() => passwordResetRequestSchema.parse({ email: "ana@example.com", extra: true })).toThrow();
    expect(() =>
      passwordResetConsumeSchema.parse({ token: "reset-token-for-test", password: validPassword, extra: true }),
    ).toThrow();
  });

  it("keeps public mutation results generic", () => {
    expect(successResult("AUTH_ACCEPTED", {})).toEqual({
      ok: true,
      code: "AUTH_ACCEPTED",
      data: {},
      fieldErrors: {},
      formError: null,
    });
    expect(failureResult("AUTH_REJECTED")).toEqual({
      ok: false,
      code: "AUTH_REJECTED",
      data: {},
      fieldErrors: {},
      formError: null,
    });
  });
});
