# Phase 1 Data and Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the JavaScript test harness, frozen shared contracts, complete initial PostgreSQL schema, migrations, fixtures, and real concurrency proof required by all later Proveras features.

**Architecture:** Keep the existing Next.js App Router foundation and add server-only database modules backed by Drizzle and `pg`. Use a single `schedule_entries` collision surface with a PostgreSQL GiST exclusion constraint so appointments and blocks cannot overlap for one employee, while public contracts expose no client identity.

**Tech Stack:** Node.js 24, Next.js 16.3.3, JavaScript with JSDoc checking, Vitest, Zod, Drizzle ORM/Kit, node-postgres, PostgreSQL 17, Testcontainers.

**Spec:** `docs/superpowers/specs/2026-08-30-proveras-platform-design.md`

## Global Constraints

- Product code and tests remain JavaScript; TypeScript is used only as the checker for `allowJs`/`checkJs`.
- The deployable and npm project root is `apps/web`.
- Business time zone is exactly `America/Sao_Paulo`; database instants use `timestamptz`.
- Public availability may expose only employee/service query context, slot instants, availability, the exact label `Horário indisponível`, and next available start.
- The database, not the browser or an application pre-check, is the final protection against overlapping active intervals.
- PostgreSQL concurrency tests use a real server and may not be mocked or silently skipped.
- No `.env*` file except `.env.example`, credential, valid PIX payload, card data, or customer data may enter a commit.
- Preserve the owner's uncommitted `INSTRUCOES_PROJETO.md` change and all root image files.

---

### Task 1: Reproducible test and type-check foundation

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/package-lock.json`
- Modify: `apps/web/jsconfig.json`
- Modify: `apps/web/src/app/layout.js`
- Create: `apps/web/vitest.config.mjs`
- Create: `apps/web/src/test/setup.js`
- Create: `apps/web/src/test/smoke.test.js`
- Create: `apps/web/src/lib/time/business-time.js`

**Interfaces:**
- Consumes: existing Next.js JavaScript application and npm lockfile.
- Produces: `npm test`, `npm run test:unit`, `npm run test:integration`, `npm run test:coverage`, and `npm run typecheck`.

- [ ] **Step 1: Install pinned capability groups through npm**

Run from `apps/web`:

```powershell
npm install drizzle-orm pg zod date-fns date-fns-tz server-only
npm install --save-dev drizzle-kit vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event testcontainers typescript @types/node @types/react @types/react-dom
```

Expected: `package.json` and `package-lock.json` change without audit-critical installation errors.

- [ ] **Step 2: Write the failing smoke test**

Create `src/test/smoke.test.js`:

```js
import { describe, expect, it } from "vitest";
import { toBusinessDate } from "@/lib/time/business-time";

describe("test foundation", () => {
  it("converts an instant across the salon date boundary", () => {
    expect(toBusinessDate("2026-09-01T02:30:00.000Z")).toBe("2026-08-31");
  });
});
```

- [ ] **Step 3: Configure Vitest and scripts, then verify RED**

Create `vitest.config.mjs` with the `@` alias pointing at `src`, `jsdom` as the default environment, `src/test/setup.js` as setup, and two projects: unit tests excluding `*.integration.test.js`, and integration tests including only that suffix with `node` environment and a 120-second timeout. Add scripts:

```json
{
  "test": "vitest run",
  "test:unit": "vitest run --project unit",
  "test:integration": "vitest run --project integration",
  "test:coverage": "vitest run --coverage",
  "typecheck": "next typegen && tsc --noEmit --project jsconfig.json"
}
```

Set `allowJs`, `checkJs`, `noEmit`, `strict`, `module`, `moduleResolution`, JSX, DOM, and Node library options in `jsconfig.json`, keeping the full `src` tree covered. Add a JSDoc type for the existing `children` prop in `src/app/layout.js`. Run:

```powershell
npm run test:unit -- src/test/smoke.test.js
```

Expected: FAIL because `@/lib/time/business-time` does not exist.

- [ ] **Step 4: Write the minimal implementation and verify GREEN**

Create `src/lib/time/business-time.js` with a formatter fixed to `America/Sao_Paulo` and an exported `toBusinessDate(instant)` function that returns an ISO calendar date. Invalid instants must throw `RangeError` rather than returning an invalid string.

```js
export const BUSINESS_TIME_ZONE = "America/Sao_Paulo";

export function toBusinessDate(instant) {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) throw new RangeError("Invalid instant");
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
```

Run the smoke test, `npm run typecheck`, `npm run lint`, and `npm run build`. Expected: all exit 0.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/package.json apps/web/package-lock.json apps/web/jsconfig.json apps/web/vitest.config.mjs apps/web/src/test apps/web/src/lib/time/business-time.js apps/web/src/app/layout.js
git commit -m "test(web): establish JavaScript verification harness"
```

---

### Task 2: Frozen public and mutation contracts

**Files:**
- Create: `apps/web/src/features/shared/mutation-result.js`
- Create: `apps/web/src/features/shared/mutation-result.test.js`
- Create: `apps/web/src/features/scheduling/contracts.js`
- Create: `apps/web/src/features/scheduling/contracts.test.js`

**Interfaces:**
- Consumes: Zod and `BUSINESS_TIME_ZONE`.
- Produces: `availabilityQuerySchema`, `publicAvailabilitySchema`, `bookingInputSchema`, `cancellationInputSchema`, `successResult`, and `failureResult` for every dependent module.

- [ ] **Step 1: Write failing contract tests**

Tests must prove:

```js
expect(() => publicAvailabilitySchema.parse({
  employeeId,
  serviceId,
  businessDate: "2026-09-01",
  timeZone: "America/Sao_Paulo",
  slots: [{
    startsAt: "2026-09-01T12:00:00.000Z",
    endsAt: "2026-09-01T12:30:00.000Z",
    available: false,
    unavailableLabel: "Horário indisponível",
  }],
  nextAvailableStartsAt: null,
})).not.toThrow();

expect(() => publicAvailabilitySchema.parse({
  employeeId,
  serviceId,
  businessDate: "2026-09-01",
  timeZone: "America/Sao_Paulo",
  slots: [{
    startsAt: "2026-09-01T12:00:00.000Z",
    endsAt: "2026-09-01T12:30:00.000Z",
    available: false,
    unavailableLabel: "Horário indisponível",
    clientName: "Dado proibido",
  }],
  nextAvailableStartsAt: null,
})).toThrow();
```

Also test UUIDs, strict object parsing, date format, ISO instants, CASH/PIX/CARD enum input, and exact stable failure codes.

- [ ] **Step 2: Verify RED**

Run both test files. Expected: FAIL because the contract modules do not exist.

- [ ] **Step 3: Implement strict Zod schemas and result factories**

`bookingInputSchema` accepts employee ID, service ID, start instant, and payment method. `cancellationInputSchema` accepts only appointment ID. `publicAvailabilitySchema` is strict at every object level. Result factories return:

```js
successResult(code, data) === {
  ok: true,
  code,
  data,
  fieldErrors: {},
  formError: null,
}
```

and the corresponding `ok: false` failure with an empty data object.

- [ ] **Step 4: Verify GREEN and contracts**

Run the two focused tests, then `npm run test:unit` and `npm run typecheck`. Expected: all pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/features/shared apps/web/src/features/scheduling
git commit -m "feat(web): freeze scheduling contracts"
```

---

### Task 3: PostgreSQL connection and migration runner

**Files:**
- Create: `apps/web/drizzle.config.js`
- Create: `apps/web/src/db/client.js`
- Create: `apps/web/src/db/migrate.js`
- Create: `apps/web/src/db/test-database.js`
- Create: `apps/web/src/db/migrations.integration.test.js`
- Create: `apps/web/drizzle/0000_extensions.sql`
- Create: `apps/web/drizzle/meta/_journal.json`
- Modify: `apps/web/package.json`

**Interfaces:**
- Consumes: `DATABASE_URL` and optional `DATABASE_POOL_MAX`.
- Produces: `createDatabasePool(connectionString, options)`, `db`, `pool`, `runMigrations(connectionString)`, and a real PostgreSQL test lifecycle.

- [ ] **Step 1: Write the failing real-database migration test**

The integration test starts `postgres:17-alpine`, calls `runMigrations`, queries `pg_extension` for `btree_gist`, and queries Drizzle's migration journal. It must fail because database modules and migrations do not exist.

- [ ] **Step 2: Verify RED against a real PostgreSQL process**

Run:

```powershell
npm run test:integration -- src/db/migrations.integration.test.js
```

Expected: the container starts, then the test fails on the missing migration API. If the container runtime itself is unavailable, stop and use systematic debugging; do not convert this test to a mock or skip.

- [ ] **Step 3: Implement connection and migration boundaries**

Create a bounded `pg.Pool` at module scope, attach Drizzle to it, and prevent accidental browser imports with `server-only`. `runMigrations` constructs an isolated pool, calls Drizzle's migrator with `migrationsFolder: "drizzle"`, and closes the pool in `finally`. The first migration enables `btree_gist` and `pgcrypto`; the journal records that migration.

Add scripts:

```json
{
  "db:generate": "drizzle-kit generate",
  "db:migrate": "node src/db/migrate.js",
  "db:check": "drizzle-kit check"
}
```

- [ ] **Step 4: Verify GREEN for migration infrastructure**

Re-run the focused integration test twice against the same database. Expected: both runs pass, required extensions exist, and the migration is applied once.

- [ ] **Step 5: Commit the infrastructure**

```powershell
git add apps/web/drizzle.config.js apps/web/src/db apps/web/drizzle apps/web/package.json apps/web/package-lock.json
git commit -m "feat(db): add PostgreSQL migration infrastructure"
```

---

### Task 4: Complete initial schema and SQL invariants

**Files:**
- Create: `apps/web/src/db/schema/enums.js`
- Create: `apps/web/src/db/schema/identity.js`
- Create: `apps/web/src/db/schema/catalog.js`
- Create: `apps/web/src/db/schema/scheduling.js`
- Create: `apps/web/src/db/schema/operations.js`
- Create: `apps/web/src/db/schema/index.js`
- Create: `apps/web/drizzle/0001_proveras_initial.sql`
- Modify: `apps/web/drizzle/meta/_journal.json`
- Modify: `apps/web/src/db/migrations.integration.test.js`

**Interfaces:**
- Consumes: the approved data model and migration runner.
- Produces: Drizzle table exports named `users`, `accounts`, `passwordResetTokens`, `authEvents`, `employees`, `services`, `employeeServices`, `portfolioItems`, `scheduleEntries`, `appointments`, `scheduleBlocks`, `cancellationCredits`, `integrationOutbox`, `calendarSyncs`, `reminderDeliveries`, `privacyRequests`, and `auditLog`.

- [ ] **Step 1: Extend the failing migration test with exact invariants**

Assert all table names, `timestamptz` scheduling columns, unique normalized e-mail, exactly one detail row per schedule entry, price/duration checks, outbox idempotency, and the named constraint `schedule_entries_no_employee_overlap`.

- [ ] **Step 2: Verify RED**

Run the focused integration test. Expected: FAIL listing missing tables/constraints.

- [ ] **Step 3: Declare the Drizzle schema**

Use UUID primary keys with `gen_random_uuid()`, explicit enum types, integer cents, timestamps with time zone, foreign-key delete behavior, and focused indexes. `services` includes `price_verified_at`; unverified development prices never satisfy release readiness.

- [ ] **Step 4: Write the initial SQL migration**

The migration begins with:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

After creating the schema, add:

```sql
ALTER TABLE "schedule_entries"
  ADD CONSTRAINT "schedule_entries_valid_interval"
  CHECK ("ends_at" > "starts_at");

ALTER TABLE "schedule_entries"
  ADD CONSTRAINT "schedule_entries_no_employee_overlap"
  EXCLUDE USING gist (
    "employee_id" WITH =,
    tstzrange("starts_at", "ends_at", '[)') WITH &&
  ) WHERE ("status" = 'ACTIVE');

ALTER TABLE "cancellation_credits"
  ADD CONSTRAINT "cancellation_credits_slot_number"
  CHECK ("slot_number" BETWEEN 1 AND 3);
```

Use unique constraints on `(client_id, slot_number)`, OAuth provider/account identity, normalized e-mail, schedule detail IDs, privacy protocol, and outbox idempotency key.

- [ ] **Step 5: Verify GREEN against real PostgreSQL**

Run the migration test twice against the same test database to prove migration bookkeeping is idempotent, then run `npm run db:check`, integration tests, typecheck, and lint. Expected: all pass.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/db/schema apps/web/drizzle apps/web/src/db/migrations.integration.test.js
git commit -m "feat(db): define Proveras relational model"
```

---

### Task 5: Prove interval concurrency and cancellation-credit integrity

**Files:**
- Create: `apps/web/src/db/repositories/schedule-repository.js`
- Create: `apps/web/src/db/repositories/cancellation-credit-repository.js`
- Create: `apps/web/src/db/scheduling-concurrency.integration.test.js`
- Create: `apps/web/src/db/cancellation-credits.integration.test.js`

**Interfaces:**
- Consumes: a transaction-bound Drizzle or `pg` client and active schema records.
- Produces: `insertActiveScheduleEntry`, `cancelScheduleEntry`, `claimCancellationCredit`, and `listCancellationCreditRenewals`.

- [ ] **Step 1: Write failing concurrency tests**

Using separate pooled connections and a barrier, prove:

- two concurrent identical inserts for one employee yield exactly one success;
- partial overlaps fail;
- touching half-open intervals succeed;
- the same time for different employees succeeds;
- an appointment colliding with a block fails;
- cancelling an entry allows immediate reuse.

Assert PostgreSQL SQLSTATE `23P01` is translated to the repository error code `SLOT_UNAVAILABLE`.

- [ ] **Step 2: Write failing credit tests**

Create exactly three credit rows and prove:

- three client cancellations can atomically claim distinct credits;
- a fourth claim fails with three renewal dates;
- a credit becomes available precisely 30 days after its own use;
- two concurrent claims cannot consume the same credit;
- employee/admin initiated cancellation does not claim a client credit.

- [ ] **Step 3: Verify RED**

Run both focused integration files. Expected: FAIL because repositories do not exist.

- [ ] **Step 4: Implement minimal transaction-aware repositories**

`insertActiveScheduleEntry` performs one insert and translates only the named exclusion constraint. `claimCancellationCredit` uses `SELECT ... FOR UPDATE` ordered by slot number, updates one eligible row to `usedAt + interval '30 days'`, and otherwise returns all renewal instants.

- [ ] **Step 5: Verify GREEN and repeat races**

Run each concurrency case at least ten times in the same test execution, followed by the full integration suite. Expected: deterministic pass with no skipped PostgreSQL tests.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/db/repositories apps/web/src/db/*integration.test.js
git commit -m "test(db): prove scheduling concurrency invariants"
```

---

### Task 6: Approved development fixtures and privacy-safe seed

**Files:**
- Create: `apps/web/src/db/seeds/catalog-data.js`
- Create: `apps/web/src/db/seeds/development.js`
- Create: `apps/web/src/db/seeds/development.integration.test.js`
- Modify: `apps/web/package.json`
- Modify: `apps/web/.env.example`

**Interfaces:**
- Consumes: supplied portfolio paths and service definitions from `INSTRUCOES_PROJETO.md`.
- Produces: `seedDevelopmentDatabase(db)` with clearly fictitious users/prices and idempotent catalog data.

- [ ] **Step 1: Write the failing seed test**

Assert nine services with specified initial durations, twelve exact portfolio paths/alternative texts, three credits for each fictitious client, no active staff self-signup path, and idempotent second execution. Assert every seeded price has `price_verified_at = null`.

- [ ] **Step 2: Verify RED**

Run the focused integration test. Expected: FAIL because seed modules do not exist.

- [ ] **Step 3: Implement the deterministic seed**

Use only reserved example addresses such as `cliente@example.com`. Mark display names and prices as fictitious. Hash any test-only password at execution time rather than storing a password or hash in the repository. Do not run the seed automatically in production.

Add `db:seed:development` and configuration names for `DATABASE_URL`, `DATABASE_POOL_MAX`, and `DEVELOPMENT_SEED_ENABLED` to `.env.example` without values.

- [ ] **Step 4: Verify GREEN**

Run the seed test, full integration suite, full unit suite, typecheck, lint, build, and `git diff --check`. Expected: all pass.

- [ ] **Step 5: Independent review gate**

Request specification-compliance review followed by code-quality review. Resolve every critical and important item and rerun the affected tests.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/db/seeds apps/web/package.json apps/web/package-lock.json apps/web/.env.example
git commit -m "feat(db): add privacy-safe development fixtures"
```

## Phase completion evidence

The architect must independently inspect the diff and run from `apps/web`:

```powershell
npm ci
npm run test:unit
npm run test:integration
npm run typecheck
npm run lint
npm run build
npm run db:check
git diff --check
```

Required evidence is a real PostgreSQL 17 process, zero skipped concurrency tests, exact constraint inspection, clean secret scan, and no staged or committed change to `INSTRUCOES_PROJETO.md`.
