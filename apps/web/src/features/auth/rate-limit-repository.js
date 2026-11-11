import "server-only";

import { createHmac } from "node:crypto";

const BUCKET_KEY_PATTERN = /^[0-9a-f]{64}$/u;
const NETWORK_ATTRIBUTE_PATTERN = /^network:v1:[0-9a-f]{64}$/u;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;
const AUTH_PURPOSES = new Set(["login", "reset"]);

/** @param {unknown} value @param {string} name */
function assertSafeString(value, name) {
  if (
    typeof value !== "string"
    || value.length === 0
    || CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    throw new TypeError(`${name} must be a non-empty string without control characters`);
  }
}

/** @param {string} value */
function lengthPrefixed(value) {
  const bytes = Buffer.from(value, "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  return Buffer.concat([length, bytes]);
}

/** @param {unknown} value @param {string} name */
function assertPositiveSafeInteger(value, name) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
}

/**
 * Derive an opaque PostgreSQL bucket from identity material that the caller has
 * already normalized and privacy-reduced. The purpose prefix provides domain
 * separation so login and password-reset attempts never share a bucket.
 *
 * @param {{purpose: "login"|"reset", emailNormalized: string, networkAttribute: string, secret: string}} input
 */
export function deriveAuthBucket({ purpose, emailNormalized, networkAttribute, secret }) {
  if (!AUTH_PURPOSES.has(purpose)) {
    throw new TypeError("purpose must be login or reset");
  }
  assertSafeString(emailNormalized, "emailNormalized");
  if (emailNormalized !== emailNormalized.trim().toLowerCase()) {
    throw new TypeError("emailNormalized must already be trimmed and lower-case");
  }
  assertSafeString(networkAttribute, "networkAttribute");
  if (!NETWORK_ATTRIBUTE_PATTERN.test(networkAttribute)) {
    throw new TypeError("networkAttribute must use canonical network:v1:<sha256> format");
  }
  assertSafeString(secret, "secret");

  const payload = Buffer.concat([
    Buffer.from("proveras:auth-rate-limit:v1", "utf8"),
    lengthPrefixed(purpose),
    lengthPrefixed(emailNormalized),
    lengthPrefixed(networkAttribute),
  ]);

  return createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
}

/**
 * Count one authentication attempt with a single PostgreSQL upsert. The unique
 * bucket row serializes concurrent callers. The current attempt is allowed
 * through maxAttempts; maxAttempts + 1 establishes the block. A completed block
 * starts a fresh window on the next attempt.
 *
 * @param {{query: (text: string, values: unknown[]) => Promise<{rows?: Array<Record<string, unknown>>}>}} client
 * @param {{bucketKey: string, now: Date, windowMs: number, maxAttempts: number, blockMs: number}} input
 * @returns {Promise<{allowed: boolean, blockedUntil: Date|null}>}
 */
export async function consumeAuthAttempt(
  client,
  { bucketKey, now, windowMs, maxAttempts, blockMs },
) {
  if (typeof client?.query !== "function") {
    throw new TypeError("client must provide query(text, values)");
  }
  if (typeof bucketKey !== "string" || !BUCKET_KEY_PATTERN.test(bucketKey)) {
    throw new TypeError("bucketKey must be a lower-case HMAC-SHA-256 hex digest");
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new TypeError("now must be a valid Date");
  }
  assertPositiveSafeInteger(windowMs, "windowMs");
  assertPositiveSafeInteger(maxAttempts, "maxAttempts");
  if (maxAttempts >= 2_147_483_647) {
    throw new TypeError("maxAttempts must fit the PostgreSQL attempts counter");
  }
  assertPositiveSafeInteger(blockMs, "blockMs");

  const result = await client.query(
    `with attempted as (
       insert into auth_rate_limits
         (bucket_key, window_started_at, attempts, blocked_until, updated_at)
       values ($1, $2, 1, null, $2)
       on conflict (bucket_key) do update
       set window_started_at = case
             when auth_rate_limits.blocked_until is not null
               and auth_rate_limits.blocked_until <= $2 then $2
             when auth_rate_limits.window_started_at
               + ($3::double precision * interval '1 millisecond') <= $2 then $2
             else auth_rate_limits.window_started_at
           end,
           attempts = case
             when auth_rate_limits.blocked_until > $2 then auth_rate_limits.attempts
             when auth_rate_limits.blocked_until is not null then 1
             when auth_rate_limits.window_started_at
               + ($3::double precision * interval '1 millisecond') <= $2 then 1
             else auth_rate_limits.attempts + 1
           end,
           blocked_until = case
             when auth_rate_limits.blocked_until > $2 then auth_rate_limits.blocked_until
             when auth_rate_limits.blocked_until is not null then null
             when auth_rate_limits.window_started_at
               + ($3::double precision * interval '1 millisecond') <= $2 then null
             when auth_rate_limits.attempts + 1 > $4::integer
               then $2::timestamptz + ($5::double precision * interval '1 millisecond')
             else null
           end,
           updated_at = $2
       returning attempts, blocked_until
     )
     select attempts <= $4::integer and blocked_until is null as allowed,
            blocked_until
       from attempted`,
    [bucketKey, now, windowMs, maxAttempts, blockMs],
  );
  const row = result?.rows?.[0];
  if (!row || typeof row.allowed !== "boolean") {
    throw new Error("Authentication attempt could not be recorded");
  }

  return {
    allowed: row.allowed,
    blockedUntil: row.blocked_until == null
      ? null
      : new Date(/** @type {string|number|Date} */ (row.blocked_until)),
  };
}
