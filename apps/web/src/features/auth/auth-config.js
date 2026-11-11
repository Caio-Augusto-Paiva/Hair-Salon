import "server-only";

import { createHmac, hkdfSync } from "node:crypto";
import { EncryptJWT, base64url, calculateJwkThumbprint } from "jose";
import { decode as decodeAuthJwt } from "next-auth/jwt";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { pool as runtimePool } from "../../db/client.js";
import { authenticateCredentials, resolveGoogleAccount } from "./account-repository.js";
import { credentialsInputSchema } from "./contracts.js";
import { consumeAuthAttempt, deriveAuthBucket } from "./rate-limit-repository.js";

const ROLES = new Set(["CLIENT", "EMPLOYEE", "ADMIN"]);
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1_000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const RATE_LIMIT_BLOCK_MS = 15 * 60 * 1_000;
const DEFAULT_JWT_MAX_AGE = 30 * 24 * 60 * 60;
const JWT_ALGORITHM = "dir";
const JWT_ENCRYPTION = "A256CBC-HS512";

/** @param {unknown} value */
function validRole(value) {
  return typeof value === "string" && ROLES.has(value);
}

/** @param {unknown} value */
function validSessionVersion(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** @param {unknown} value */
function validIdentityId(value) {
  return typeof value === "string" && value.length > 0;
}

/** @param {any} headers */
function forwardedAddress(headers) {
  const forwarded = typeof headers?.get === "function"
    ? headers.get("x-forwarded-for")
    : headers?.["x-forwarded-for"];
  const remoteAddress = typeof headers?.get === "function"
    ? headers.get("x-real-ip")
    : headers?.["x-real-ip"];
  const value = forwarded ?? remoteAddress;
  if (typeof value !== "string") return "unknown";
  return value.split(",", 1)[0].trim() || "unknown";
}

/**
 * Convert a network address to a one-way, domain-separated attribute before
 * the rate-limit repository sees it. Neither the address nor e-mail is stored.
 *
 * @param {string} address
 * @param {string} secret
 */
function networkAttribute(address, secret) {
  return `network:v1:${createHmac("sha256", secret)
    .update("proveras:auth-network:v1\u0000")
    .update(address)
    .digest("hex")}`;
}

/** @param {Record<string, unknown>} token @param {Record<string, unknown>|undefined} user */
function minimalToken(token, user) {
  const source = user && typeof user === "object" ? user : token;
  const result = {};
  const subject = source?.id ?? source?.sub;
  if (typeof subject === "string" && subject.length > 0) result.sub = subject;
  if (validRole(source?.role)) result.role = source.role;
  if (validSessionVersion(source?.sessionVersion)) result.sessionVersion = source.sessionVersion;
  if (typeof token?.iat === "number") result.iat = token.iat;
  if (typeof token?.exp === "number") result.exp = token.exp;
  return result;
}

/** @param {Record<string, unknown>} token */
function minimalSessionUser(token) {
  if (
    typeof token?.sub !== "string"
    || !validRole(token.role)
    || !validSessionVersion(token.sessionVersion)
  ) {
    return null;
  }
  return { id: token.sub, role: token.role, sessionVersion: token.sessionVersion };
}

/** @param {unknown} secret */
function currentJwtSecret(secret) {
  const current = Array.isArray(secret) ? secret[0] : secret;
  if (typeof current !== "string" || current.length === 0) {
    throw new TypeError("JWT secret must contain a non-empty current secret");
  }
  return current;
}

/** @param {string} secret @param {string} salt */
function deriveJwtEncryptionKey(secret, salt) {
  if (typeof salt !== "string" || salt.length === 0) {
    throw new TypeError("JWT salt must be a non-empty string");
  }
  const key = hkdfSync(
    "sha256",
    secret,
    salt,
    `Auth.js Generated Encryption Key (${salt})`,
    64,
  );
  return new Uint8Array(key);
}

/** @param {{token?: Record<string, unknown>, secret: string|string[], salt: string, maxAge?: number}} params */
async function encodeJwt(params) {
  const secret = currentJwtSecret(params?.secret);
  const maxAge = params?.maxAge ?? DEFAULT_JWT_MAX_AGE;
  if (!Number.isSafeInteger(maxAge) || maxAge <= 0) {
    throw new TypeError("JWT maxAge must be a positive safe integer");
  }

  const minimal = minimalToken(params?.token ?? {}, undefined);
  if (
    typeof minimal.sub !== "string"
    || minimal.sub.length === 0
    || !validRole(minimal.role)
    || !validSessionVersion(minimal.sessionVersion)
  ) {
    throw new TypeError("JWT token must contain valid identity claims");
  }
  /** @type {import("jose").JWTPayload} */
  const payload = {
    sub: minimal.sub,
    role: minimal.role,
    sessionVersion: minimal.sessionVersion,
  };

  const encryptionSecret = deriveJwtEncryptionKey(secret, params.salt);
  const kid = await calculateJwkThumbprint(
    { kty: "oct", k: base64url.encode(encryptionSecret) },
    "sha512",
  );

  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: JWT_ALGORITHM, enc: JWT_ENCRYPTION, kid })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1_000) + maxAge)
    .encrypt(encryptionSecret);
}

/** @param {{token?: string|null, secret: string|string[], salt: string}} params */
async function decodeJwt(params) {
  if (!params?.token) return null;
  try {
    return await decodeAuthJwt({ ...params, token: params.token });
  } catch {
    return null;
  }
}

/**
 * Build Auth.js options without reading a secret or opening a connection at
 * import time. The explicit seams keep the production boundary testable.
 *
 * @param {{
 *   env?: Record<string, string|undefined>, pool?: any,
 *   providerFactories?: {Credentials?: Function, Google?: Function},
 *   dependencies?: {deriveAuthBucket?: Function, consumeAuthAttempt?: Function, authenticateCredentials?: Function, resolveGoogleAccount?: Function},
 *   now?: () => Date,
 * }} [input]
 */
export function createAuthConfig(input = {}) {
  const env = input.env ?? process.env;
  const databasePool = input.pool ?? runtimePool;
  const providerFactories = input.providerFactories ?? {};
  const makeCredentials = providerFactories.Credentials ?? CredentialsProvider;
  const makeGoogle = providerFactories.Google ?? GoogleProvider;
  const dependencies = {
    deriveAuthBucket,
    consumeAuthAttempt,
    authenticateCredentials,
    resolveGoogleAccount,
    ...input.dependencies,
  };
  const now = input.now ?? (() => new Date());
  const rateLimit = {
    windowMs: RATE_LIMIT_WINDOW_MS,
    maxAttempts: RATE_LIMIT_MAX_ATTEMPTS,
    blockMs: RATE_LIMIT_BLOCK_MS,
  };

  const credentials = makeCredentials({
    id: "credentials",
    name: "Credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(/** @type {unknown} */ untrustedCredentials, /** @type {any} */ request) {
      const source = untrustedCredentials && typeof untrustedCredentials === "object"
        ? /** @type {Record<string, unknown>} */ (untrustedCredentials)
        : null;
      const parsed = credentialsInputSchema.safeParse(source && {
        email: source.email,
        password: source.password,
      });
      if (!parsed.success || !databasePool || !env.AUTH_RATE_LIMIT_SECRET) return null;

      try {
        const bucketKey = dependencies.deriveAuthBucket({
          purpose: "login",
          emailNormalized: parsed.data.email,
          networkAttribute: networkAttribute(
            forwardedAddress(request?.headers),
            env.AUTH_RATE_LIMIT_SECRET,
          ),
          secret: env.AUTH_RATE_LIMIT_SECRET,
        });
        const attempt = await dependencies.consumeAuthAttempt(databasePool, {
          bucketKey,
          now: now(),
          ...rateLimit,
        });
        if (!attempt?.allowed) return null;
        const account = await dependencies.authenticateCredentials(databasePool, parsed.data);
        if (!account || account.status !== "ACTIVE") return null;
        if (
          !validIdentityId(account.id)
          || !validRole(account.role)
          || !validSessionVersion(account.sessionVersion)
        ) return null;
        return { id: account.id, role: account.role, sessionVersion: account.sessionVersion };
      } catch {
        // Credentials failures are intentionally non-enumerating.
        return null;
      }
    },
  });

  const providers = [credentials];
  if (env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET) {
    providers.push(makeGoogle({
      id: "google",
      clientId: env.AUTH_GOOGLE_ID,
      clientSecret: env.AUTH_GOOGLE_SECRET,
    }));
  }

  return {
    secret: env.AUTH_SECRET,
    session: { strategy: "jwt" },
    jwt: { encode: encodeJwt, decode: decodeJwt },
    providers,
    cookies: {
      sessionToken: {
        name: "next-auth.session-token",
        options: {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          secure: env.NODE_ENV !== "development",
        },
      },
    },
    callbacks: {
      async signIn(/** @type {any} */ input) {
        const { user, account, profile } = input;
        if (account?.provider !== "google") return true;
        if (!databasePool) return false;
        try {
          const resolved = await dependencies.resolveGoogleAccount(databasePool, {
            provider: "google",
            providerAccountId: account.providerAccountId,
            email: profile?.email ?? user?.email,
            emailVerified: profile?.email_verified === true,
            name: profile?.name ?? user?.name ?? "",
          });
          if (
            resolved?.status !== "ACTIVE"
            || !validIdentityId(resolved?.id)
            || !validRole(resolved?.role)
            || !validSessionVersion(resolved?.sessionVersion)
          ) return false;
          for (const key of Object.keys(user)) delete user[key];
          Object.assign(user, {
            id: resolved.id,
            role: resolved.role,
            sessionVersion: resolved.sessionVersion,
          });
          return true;
        } catch {
          return false;
        }
      },
      async jwt(/** @type {any} */ input) {
        const { token, user } = input;
        return minimalToken(token, user);
      },
      async session(/** @type {any} */ input) {
        const { session, token } = input;
        const publicUser = minimalSessionUser(token);
        return publicUser ? { user: publicUser, expires: session.expires } : { expires: session.expires };
      },
    },
  };
}
