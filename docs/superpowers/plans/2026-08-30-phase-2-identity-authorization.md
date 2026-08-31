# Phase 2: Identity and Authorization Implementation Plan

> **Execution:** Use `$using-git-worktrees`, `$test-driven-development`, `$subagent-driven-development`, `$requesting-code-review`, and `$verification-before-completion`. Apply `$systematic-debugging` to every unexpected failure.

**Goal:** Deliver the server-side identity system: client signup, credential and optional Google login, JWT sessions, current-state authorization, administrator-created employee accounts, password reset, privacy-preserving rate limits, and Auth.js route handlers.

**Architecture:** Auth.js uses JWT sessions in secure cookies, but the JWT is never an authorization database. Every protected operation reloads `users.status`, `users.role`, and `users.session_version`. Credential storage uses Node 24's native Argon2id implementation and a versioned PHC-style envelope. PostgreSQL transactions own account creation, OAuth linking, rate limiting, password-reset consumption, session invalidation, and audit events.

**Runtime:** Pin `engines.node` to `24.x`; Vercel currently supports and defaults new projects to Node 24. Auth.js credentials validation remains custom, as its Credentials provider does not persist users or implement password reset/rate limiting. References: [Auth.js Credentials](https://authjs.dev/getting-started/authentication/credentials), [Auth.js resource protection](https://authjs.dev/getting-started/session-management/protecting), [Node Argon2](https://nodejs.org/api/crypto.html), and [Vercel Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

## Fixed security contracts

- Public signup and first-time Google login can create `CLIENT` only.
- Employee accounts are created only by an active `ADMIN`; there is no staff self-signup contract.
- Google is configured only when both client ID and client secret exist. A verified Google e-mail may link to the same normalized e-mail; roles are never upgraded.
- JWT claims contain only `sub`, `role`, `sessionVersion`, and standard issue/expiry fields. No e-mail, provider token, or appointment data is copied into claims.
- Protected services compare JWT identity, role, status, and session version with the current database row.
- Public auth failures are non-enumerating. Security events contain stable codes and HMAC-derived request buckets, not raw IP/e-mail combinations.
- Reset tokens are 32 random bytes, delivered only to an injected adapter, stored only as SHA-256 hashes, expire within 24 hours, and are consumed atomically once.
- Password policy is 8–128 characters. Hashes use Argon2id with an explicit, versioned parameter envelope and constant-time verification.
- Auth.js cookies are `HttpOnly`, `SameSite=Lax`, path `/`, and `Secure` outside local development.

## Architect preflight rulings

- OAuth account rows persist only provider type/name/subject identifiers. Access, refresh, and ID tokens remain unset even though the Phase 1 schema permits nullable compatibility columns.
- Auth.js configuration is exposed through an injectable factory. Importing modules and building the application must not require production secrets or a live database; runtime handlers still fail closed when mandatory secrets are absent.
- Request boundaries reduce the network address and HMAC it with the dedicated rate-limit secret before repository calls. PostgreSQL receives only a domain-separated bucket key and never a raw address or e-mail.
- `createEmployeeAccount` accepts an actor identity claim, reloads the actor from PostgreSQL, and authorizes the current `ACTIVE ADMIN` state itself. It does not depend on the Task 4 HTTP/session guard.
- Public password-reset responses never expose the raw token or capture-adapter payload. Capture output is local-test evidence only.
- Auth.js intentionally uses no stock database adapter because the approved Phase 1 schema is not the adapter schema; Google resolution and linking remain explicit repository operations.
- Phase 2 inherits the Phase 1 external PostgreSQL and Drizzle inspection gates. Local unit/build success does not waive those gates.

---

### Task 1: Freeze identity contracts and native password hashing

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/package-lock.json`
- Create: `apps/web/src/features/auth/contracts.js`
- Create: `apps/web/src/features/auth/contracts.test.js`
- Create: `apps/web/src/features/auth/password.js`
- Create: `apps/web/src/features/auth/password.test.js`

**Produces:** `signupInputSchema`, `credentialsInputSchema`, `passwordResetRequestSchema`, `passwordResetConsumeSchema`, `normalizeEmail`, `hashPassword`, and `verifyPassword`.

- [ ] Write failing tests for trimmed names, lowercase normalized e-mail, valid `@...com` address, 8–128 character password, unknown-key rejection, and generic public result shapes.
- [ ] Write failing password tests proving random salts, Argon2id envelope/parameters, correct verification, wrong-password rejection, malformed-hash rejection, and no plaintext substring in storage.
- [ ] Pin `engines.node` to `24.x`. Add Auth.js at the stable version resolved by npm and commit its lockfile; do not add a native Argon2 package.
- [ ] Implement asynchronous wrappers around `node:crypto.argon2`, 16-byte random salts, 32-byte tags, explicit memory/pass/parallelism parameters, parsing bounds, and `timingSafeEqual`.
- [ ] Run focused tests, full unit tests, typecheck, lint, build, and `npm audit --omit=dev`.
- [ ] Commit: `feat(auth): define identity contracts and password hashing`.

---

### Task 2: Add atomic auth rate limits and database inspection

**Files:**
- Modify: `apps/web/src/db/schema/identity.js`
- Modify: `apps/web/src/db/schema/index.js`
- Create: `apps/web/drizzle/0002_identity_security.sql`
- Modify: `apps/web/drizzle/meta/_journal.json`
- Modify: `apps/web/src/db/migrations.integration.test.js`
- Create: `apps/web/src/features/auth/rate-limit-repository.js`
- Create: `apps/web/src/features/auth/rate-limit-repository.test.js`
- Create: `apps/web/src/features/auth/rate-limit.integration.test.js`

**Produces:** `authRateLimits`, `deriveAuthBucket`, and `consumeAuthAttempt`.

- [ ] Extend the real migration test first: exact table/columns/checks, HMAC bucket only, non-negative attempts, and idempotent migration bookkeeping.
- [ ] Add `auth_rate_limits(bucket_key primary key, window_started_at timestamptz, attempts, blocked_until timestamptz, updated_at)` with checks and expiry index.
- [ ] Derive buckets with HMAC-SHA-256 using a domain-separated secret; accept normalized e-mail plus privacy-reduced network attribute only at the boundary and never persist either raw value.
- [ ] Implement one-statement/transaction-safe window increment and block decision. Concurrent attempts for one bucket must not exceed the configured allowance.
- [ ] Prove login and reset buckets are separate, window expiry resets counts, blocked responses expose no identity state, and ten concurrent attempts are deterministic on real PostgreSQL.
- [ ] Run unit, real integration, migration inspection, typecheck, lint, build, and `db:check`.
- [ ] Commit: `feat(auth): add privacy-safe authentication rate limits`.

---

### Task 3: Implement account repositories and role-safe creation

**Files:**
- Create: `apps/web/src/features/auth/account-repository.js`
- Create: `apps/web/src/features/auth/account-repository.test.js`
- Create: `apps/web/src/features/auth/accounts.integration.test.js`

**Produces:** `createClientAccount`, `authenticateCredentials`, `createEmployeeAccount`, and `resolveGoogleAccount`.

- [ ] Write failing tests for duplicate e-mail, client-only public signup, exactly three credits, inactive-user login rejection, generic invalid credentials, admin-only employee creation, and no role escalation.
- [ ] In one transaction, client signup inserts an active CLIENT with Argon2id hash, three numbered cancellation credits, and a security event. Translate only the named e-mail unique constraint.
- [ ] Credential authentication performs a dummy Argon2id verify when the account/hash is absent to reduce timing enumeration; public failure remains identical.
- [ ] Employee creation locks/reloads the actor, requires active ADMIN/current session version, inserts EMPLOYEE plus `employees` detail, and never returns a password hash.
- [ ] Google resolution requires verified e-mail, resolves provider identity first, then links the same normalized e-mail or creates CLIENT plus three credits. It never upgrades role/status or exposes provider tokens.
- [ ] Add real transaction tests, including concurrent duplicate signup/OAuth linking and rollback on partial failure.
- [ ] Run focused/full tests, typecheck, lint, build, and secret scan.
- [ ] Commit: `feat(auth): implement role-safe account repositories`.

---

### Task 4: Configure Auth.js JWT sessions and current-state guards

**Files:**
- Create: `apps/web/src/auth.js`
- Create: `apps/web/src/features/auth/auth-config.js`
- Create: `apps/web/src/features/auth/auth-config.test.js`
- Create: `apps/web/src/features/auth/session.js`
- Create: `apps/web/src/features/auth/session.test.js`
- Create: `apps/web/src/features/auth/session.integration.test.js`

**Produces:** Auth.js `handlers`, `auth`, `signIn`, `signOut`; `loadCurrentIdentity`, `requireCurrentUser`, and `requireRole`.

- [ ] Test provider composition: Credentials always present; Google absent unless both variables are present; incomplete Google config never constructs a provider.
- [ ] Test JWT/session callbacks carry only ID, role, session version, and expiry. Verify cookie options for local/non-local environments.
- [ ] Configure Credentials `authorize` with Zod, rate limit, and `authenticateCredentials`. Configure Google profile/sign-in resolution without an adapter that assumes a different schema.
- [ ] `requireCurrentUser` reloads the database row for every protected access and rejects missing, suspended/deleted, role-changed, or session-version-mismatched identities.
- [ ] `requireRole` supports exact CLIENT/EMPLOYEE/ADMIN policies and never trusts route middleware alone.
- [ ] Real integration tests prove account disable, role change, and version increment invalidate an otherwise unexpired JWT identity.
- [ ] Run unit/integration, typecheck, lint, build, and inspect server-only import boundaries.
- [ ] Commit: `feat(auth): configure secure sessions and authorization guards`.

---

### Task 5: Implement password reset and delivery boundary

**Files:**
- Create: `apps/web/src/features/auth/password-reset-repository.js`
- Create: `apps/web/src/features/auth/password-reset-repository.test.js`
- Create: `apps/web/src/features/auth/password-reset.integration.test.js`
- Create: `apps/web/src/features/email/password-reset-delivery.js`
- Create: `apps/web/src/features/email/password-reset-delivery.test.js`

**Produces:** `requestPasswordReset`, `consumePasswordReset`, `createCaptureResetDelivery`, and a disabled production delivery adapter contract.

- [ ] Write failing tests for generic request responses, unknown e-mail, active credential user, OAuth-only user, 24-hour maximum expiry, token hashing, single use, expiry boundary, and session invalidation.
- [ ] Rate-limit before identity lookup. Generate raw token with `randomBytes(32)`, persist SHA-256 only, and pass the raw token only to the injected delivery adapter.
- [ ] Consumption hashes the supplied token, locks/updates one unused unexpired row, writes a new Argon2id hash, increments `session_version`, consumes other live reset tokens, and records a security event in one transaction.
- [ ] Capture delivery stores deterministic test messages in memory without logs. Production delivery reports disabled until a provider is configured; no real e-mail is sent in this phase.
- [ ] Repeat concurrent consume races at least ten times against real PostgreSQL; exactly one succeeds.
- [ ] Run focused/full tests, typecheck, lint, build, and secret/token scan.
- [ ] Commit: `feat(auth): add single-use password reset workflow`.

---

### Task 6: Expose server actions and Auth.js route handlers

**Files:**
- Create: `apps/web/src/app/api/auth/[...nextauth]/route.js`
- Create: `apps/web/src/features/auth/actions.js`
- Create: `apps/web/src/features/auth/actions.test.js`
- Create: `apps/web/src/features/auth/actions.integration.test.js`

**Produces:** `signupAction`, `requestPasswordResetAction`, `consumePasswordResetAction`, `createEmployeeAction`, and Auth.js GET/POST handlers.

- [ ] Test FormData/untrusted-object parsing, stable mutation-result codes, non-enumerating messages, safe field errors, and absence of secrets/hashes in serialized results.
- [ ] Actions obtain server request context, derive privacy-safe rate-limit input, call repositories inside transaction boundaries, and map known domain errors only.
- [ ] `createEmployeeAction` calls `requireRole(ADMIN)` and never accepts a role from public form data.
- [ ] Route tests verify Auth.js handler exports, cookie policy, invalid credentials, optional Google provider, sign-out, and redirects without requiring UI pages.
- [ ] Run action/route tests, full suite, typecheck, lint, and build.
- [ ] Commit: `feat(auth): expose identity server boundaries`.

---

### Task 7: Environment, readiness, and phase evidence

**Files:**
- Modify: `apps/web/.env.example`
- Create: `apps/web/src/features/auth/readiness.js`
- Create: `apps/web/src/features/auth/readiness.test.js`
- Create: `docs/operations/identity-and-secrets.md`

**Produces:** `getIdentityReadiness` and an operator checklist with no real credentials.

- [ ] Add empty names only: `AUTH_SECRET`, `AUTH_RATE_LIMIT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, reset base URL, and documented e-mail-provider placeholders. Never add values.
- [ ] Readiness fails production when AUTH secret/rate-limit secret/reset URL is absent, treats incomplete Google config as disabled with a warning, and treats reset delivery as externally blocked rather than silently successful.
- [ ] Document secret generation/rotation, cookie expectations, session-version invalidation, Google callback URL, reset-token retention, event retention, and local capture-adapter use.
- [ ] Run `npm ci`, unit, integration, typecheck, lint, build, `db:check`, `npm audit --omit=dev`, secret scan, and `git diff --check`.
- [ ] Request specification review followed by security/code-quality review and resolve every P0–P2.
- [ ] Commit: `docs(auth): add identity readiness and operations guide`.

## Phase completion evidence

The architect independently inspects the full diff and records:

```powershell
cd apps/web
npm ci
npm run test:unit
npm run test:integration
npm run typecheck
npm run lint
npm run build
npm run db:check
npm audit --omit=dev
git diff --check
```

Required evidence: real PostgreSQL 17; zero skipped auth integration tests; passwords absent from logs/fixtures; token hashes only in storage; disabled/role-changed/session-version-changed accounts rejected; Google provider absent when incomplete; no staff self-signup; and no committed `.env` values or changes to `INSTRUCOES_PROJETO.md`.
