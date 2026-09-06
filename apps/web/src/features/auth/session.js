import "server-only";

const ROLES = new Set(["CLIENT", "EMPLOYEE", "ADMIN"]);

export class AuthorizationError extends Error {
  /** @param {"UNAUTHENTICATED"|"FORBIDDEN"} code */
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/** @param {unknown} value */
function validRole(value) {
  return typeof value === "string" && ROLES.has(value);
}

/** @param {unknown} value */
function validSessionVersion(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** @param {unknown} value */
function validNow(value) {
  return value instanceof Date && Number.isFinite(value.getTime());
}

/** @param {any} claim @param {Date} now */
function validClaim(claim, now) {
  return (
    claim
    && typeof claim.sub === "string"
    && claim.sub.length > 0
    && validRole(claim.role)
    && validSessionVersion(claim.sessionVersion)
    && typeof claim.exp === "number"
    && Number.isFinite(claim.exp)
    && claim.exp * 1_000 > now.getTime()
  );
}

/** @param {any} value @returns {any} */
function authSessionClaim(value) {
  if (!value || typeof value !== "object" || !("user" in value)) return value;
  const user = /** @type {any} */ (value.user);
  if (!user || typeof user !== "object" || typeof value.expires !== "string") return null;
  const expiresAt = new Date(value.expires);
  if (
    !Number.isFinite(expiresAt.getTime())
    || expiresAt.toISOString() !== value.expires
  ) return null;
  return {
    sub: user.id,
    role: user.role,
    sessionVersion: user.sessionVersion,
    exp: Math.floor(expiresAt.getTime() / 1_000),
  };
}

/**
 * Reload the current user row for one protected access. This does not trust
 * the JWT beyond using its subject to locate the current database state.
 *
 * @param {{query: Function}} pool
 * @param {{sub: string, role: string, sessionVersion: number, exp: number}} claim
 * @param {{now?: Date}} [options]
 */
export async function loadCurrentIdentity(pool, claim, options = {}) {
  const now = options.now ?? new Date();
  const currentClaim = authSessionClaim(claim);
  if (typeof pool?.query !== "function" || !validNow(now) || !validClaim(currentClaim, now)) {
    throw new AuthorizationError("UNAUTHENTICATED");
  }
  const result = await pool.query(
    `select id, role, status, session_version
       from users
      where id = $1
      limit 1`,
    [currentClaim.sub],
  );
  const row = result?.rows?.[0];
  if (!row) return null;
  return {
    id: row.id,
    role: row.role,
    status: row.status,
    sessionVersion: row.session_version,
  };
}

/**
 * @param {{query: Function}} pool
 * @param {{sub: string, role: string, sessionVersion: number, exp: number}} claim
 * @param {{now?: Date}} [options]
 */
export async function requireCurrentUser(pool, claim, options = {}) {
  const currentClaim = authSessionClaim(claim);
  const current = await loadCurrentIdentity(pool, currentClaim, options);
  if (
    !current
    || current.status !== "ACTIVE"
    || current.role !== currentClaim.role
    || current.sessionVersion !== currentClaim.sessionVersion
  ) {
    throw new AuthorizationError("UNAUTHENTICATED");
  }
  return current;
}

/**
 * @param {{query: Function}} pool
 * @param {{sub: string, role: string, sessionVersion: number, exp: number}} claim
 * @param {"CLIENT"|"EMPLOYEE"|"ADMIN"} requiredRole
 * @param {{now?: Date}} [options]
 */
export async function requireRole(pool, claim, requiredRole, options = {}) {
  const current = await requireCurrentUser(pool, claim, options);
  if (!validRole(requiredRole) || current.role !== requiredRole) {
    throw new AuthorizationError("FORBIDDEN");
  }
  return current;
}
