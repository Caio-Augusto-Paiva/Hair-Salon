import "server-only";

import NextAuth from "next-auth";
import { createAuthConfig } from "./features/auth/auth-config.js";

/**
 * Construct the native Auth.js v5 server contract without connecting to the
 * database or requiring production secrets during module evaluation.
 *
 * @param {{
 *   env?: Record<string, string|undefined>, config?: Record<string, unknown>, NextAuth?: Function,
 * }} [input]
 */
export function initializeAuth(input = {}) {
  const env = input.env ?? process.env;
  const config = input.config ?? createAuthConfig({ env });
  return (input.NextAuth ?? NextAuth)(config);
}

const nativeAuth = initializeAuth();

export const { handlers, auth, signIn, signOut } = nativeAuth;
