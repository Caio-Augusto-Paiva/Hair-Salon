import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const passwordSchema = z.string().min(8).max(128);

export const signupInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  email: emailSchema,
  password: passwordSchema,
});

export const credentialsInputSchema = z.strictObject({
  email: emailSchema,
  password: passwordSchema,
});

export const passwordResetRequestSchema = z.strictObject({
  email: emailSchema,
});

export const passwordResetConsumeSchema = z.strictObject({
  token: z.string().min(1).max(512),
  password: passwordSchema,
});

/** @param {string} email */
export function normalizeEmail(email) {
  return email.trim().toLowerCase();
}
