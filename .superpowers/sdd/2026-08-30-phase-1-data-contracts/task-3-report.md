# Task 3 — PostgreSQL connection and migration runner

Status: **DONE_WITH_CONCERNS**

The architect explicitly reopened implementation despite the unavailable
container runtime. Integration remains unverified and is reported as an
external/environmental concern below; no mock or skip was introduced.

## RED

Added `apps/web/src/db/migrations.integration.test.js` first, before any
database production module. The test uses a real `postgres:17-alpine`
container, executes `runMigrations` twice against the same database, and
asserts that `btree_gist` and `pgcrypto` exist and that Drizzle's journal has
exactly one migration.

The first run exposed an API mismatch in the installed `testcontainers@12.1.0`:

```text
TypeError: PostgreSqlContainer is not a constructor
```

Investigation of the installed package showed that this version exports
`GenericContainer` and `Wait`, but not `PostgreSqlContainer`. The test was
adjusted to configure `GenericContainer('postgres:17-alpine')` directly with
the PostgreSQL environment variables, port 5432, and a readiness log wait.

## RED rerun / initial blocking evidence

```powershell
cd apps/web
npm run test:integration -- src/db/migrations.integration.test.js
```

Result after the test API correction:

```text
FAIL |integration| src/db/migrations.integration.test.js
Error: Could not find a working container runtime strategy
```

The test never reached the migration API because no container runtime was
available. Independent environment checks also found no `docker`, `podman`, or
`nerdctl` executable; `docker version` and `docker info` both returned PowerShell
command-not-found errors. No Docker/Testcontainers environment variables were
present.

Per the task brief, this is an environmental blocker: the test must remain a
real Testcontainers integration test and must not be converted to a mock or
skip. Implementation and GREEN verification were therefore stopped.

## Reopened implementation and unit TDD

The architect authorized infrastructure implementation with unit tests for
the observable boundaries. Before implementation, the new unit tests failed
because `./client.js` and `./migrate.js` did not exist:

```text
Failed to resolve import "./client.js" from "src/db/client.test.js"
Failed to resolve import "./migrate.js" from "src/db/migrate.test.js"
```

After implementation, the focused unit suite passed:

```powershell
cd apps/web
npm run test:unit -- src/db/client.test.js src/db/migrate.test.js
```

```text
Test Files  2 passed (2)
Tests       3 passed (3)
```

The complete unit suite also passed:

```text
Test Files  5 passed (5)
Tests       32 passed (32)
```

The unit tests exercise a real pool-construction boundary through an
injected Pool constructor and a real migration-runner boundary through
injected factories. They verify bounded pool options, migrations folder
selection, pool closure after success, and pool closure plus error
propagation after failure. The only stub is the `server-only` marker package,
which is compile-time-only and throws when directly loaded by Vitest.

## Verification gates

All of these completed with exit code 0:

- `npm run test:unit` — 5 files, 32 tests passed.
- `npm run typecheck` — Next route types and TypeScript checks passed.
- `npm run lint` — ESLint passed.
- `npm run build` — Next production build passed.

The migration CLI also reaches its intended validation boundary when run
without credentials:

```powershell
npm run db:migrate
```

```text
Error: DATABASE_URL is required to create a database pool
```

`npm run db:check` and `npm run db:generate` both fail before Drizzle can
inspect the config with the same host-level error:

```text
A system error occurred: uv_os_get_passwd returned ENOMEM (not enough memory)
```

Root-cause checks confirmed this is not caused by the project config:
`node -e "require('node:os').userInfo()"` reproduces the same
`uv_os_get_passwd`/`ENOMEM` failure, while `npx drizzle-kit --version` works.

## Real integration status

The integration test was changed to run lifecycle setup inside the test body,
so runtime unavailability is a failed test rather than an implicit skipped
test. It accepts `TEST_DATABASE_URL` or `DATABASE_TEST_URL` when provided and
otherwise starts a real `postgres:17-alpine` Testcontainers instance.

Current run:

```powershell
npm run test:integration -- src/db/migrations.integration.test.js
```

```text
Test Files  1 failed (1)
Tests       1 failed (1)
Error: Unable to start the real PostgreSQL test database. Set TEST_DATABASE_URL or DATABASE_TEST_URL, or provide a Docker-compatible runtime for Testcontainers.
Cause: Could not find a working container runtime strategy
```

Docker, Podman, and nerdctl executables are absent in this host. Therefore
the required two-run migration/extension/journal assertions remain pending
on a host with Docker or an explicit real PostgreSQL test URL.

## Files changed

- `apps/web/drizzle.config.js`
- `apps/web/src/db/client.js`
- `apps/web/src/db/client.test.js`
- `apps/web/src/db/migrate.js`
- `apps/web/src/db/migrate.test.js`
- `apps/web/src/db/test-database.js`
- `apps/web/src/db/migrations.integration.test.js`
- `apps/web/drizzle/0000_extensions.sql`
- `apps/web/drizzle/meta/_journal.json`
- `apps/web/package.json`
- `apps/web/package-lock.json`
- `.superpowers/sdd/2026-08-30-phase-1-data-contracts/task-3-report.md`

The implementation commit is intentionally created with status
`DONE_WITH_CONCERNS`: all local non-Docker gates are green, but the real
PostgreSQL integration gate is externally blocked.

## Risks / next action

Remaining concern: run the integration test twice against the same real
database after Docker Desktop (or an explicit `TEST_DATABASE_URL`/
`DATABASE_TEST_URL`) is available, then confirm extensions and exactly one
journal row. No production credentials are stored in the repository.

## Review round 1 corrections

Review finding P1 was fixed by qualifying the journal query as
`"drizzle"."__drizzle_migrations"`, matching Drizzle PostgreSQL's default
migration schema. The integration assertion now tests the actual journal
location rather than the `public` schema.

Review finding P2 was fixed by injecting `startContainer` and `createPool`
boundaries into the test database lifecycle. If pool construction fails after
the container starts, `container.stop()` is awaited before the original pool
error is rethrown. The new unit test was observed RED before this change and
passes afterward, proving the cleanup behavior without starting Docker.

Final review-round verification:

```powershell
npm run test:unit
```

```text
Test Files  5 passed (5)
Tests       33 passed (33)
```

The following commands completed with exit code 0:

- `npm run typecheck`
- `npm run lint`
- `npm run build`

The real integration remains intentionally unmocked and failed explicitly:

```text
Test Files  1 failed (1)
Tests       1 failed (1)
Error: Unable to start the real PostgreSQL test database. Set TEST_DATABASE_URL or DATABASE_TEST_URL, or provide a Docker-compatible runtime for Testcontainers.
Caused by: Error: Could not find a working container runtime strategy
```

No integration GREEN claim is made until Docker or an explicit real test URL
is available.

## Closing regression correction

After a clean dependency install, the injected cleanup unit test could hit
the five-second Vitest timeout because `test-database.js` eagerly loaded the
entire Testcontainers dependency graph even when `startContainer` was
injected. The RED observation was a cold-cache focused test taking roughly 32
seconds and timing out; warm runs passed.

The minimal fix moves the Testcontainers/`GenericContainer`/`Wait` require into
the default container-start function. Injected lifecycle tests now load only
the lightweight module and no longer initialize Testcontainers. The real
default path remains unchanged and still loads Testcontainers and starts
`postgres:17-alpine`.

Verification after the fix:

- `npm run test:unit -- src/db/migrate.test.js` — 3/3 passed in 1.75s.
- Same focused command with both `TEST_DATABASE_URL` and
  `DATABASE_TEST_URL` defined — 3/3 passed in 1.77s.
- `npm run test:unit` — 10 files, 57 tests passed.
- `npm run typecheck` — exit 0.
- `npm run lint` — exit 0.
- `npm run build` — exit 0.

The real integration was attempted again and remains unmocked:

```text
Test Files  1 failed (1)
Tests       3 failed (3)
Caused by: Error: Could not find a working container runtime strategy
```

All three integration failures are the same environmental Docker blocker;
there were no skipped or passing integration assertions. The focused unit
test timeout regression is resolved, while PostgreSQL GREEN remains pending
on Docker or an explicit real test URL.

## Review round 2 correction

Review finding P1 identified that the cleanup regression test could inherit
`TEST_DATABASE_URL` or `DATABASE_TEST_URL` from CI. In that case,
`startTestDatabase` correctly prioritizes the explicit URL and bypasses the
injected Testcontainers path, so the test would not prove container cleanup.

The regression now saves both environment values, deletes both for the test,
and restores each value (including the unset state) in `finally`. RED was
reproduced before the correction with `TEST_DATABASE_URL` set: the test
reported `expected false to be true` because the container was not used.
Afterward, with both URLs set to CI-like values, the focused test passed:

```text
Test Files  1 passed (1)
Tests       3 passed (3)
```

Final round-2 verification:

- `npm run test:unit` — 5 files, 33 tests passed.
- `npm run typecheck` — exit 0.
- `npm run lint` — exit 0.
- `npm run build` — exit 0.
- `npm run test:integration -- src/db/migrations.integration.test.js` —
  1 failed/0 skipped with the existing real-runtime blocker
  `Could not find a working container runtime strategy`.

The integration test remains real and unmocked; no integration GREEN claim is
made.
