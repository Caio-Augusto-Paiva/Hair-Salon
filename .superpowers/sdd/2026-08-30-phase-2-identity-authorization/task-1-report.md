# Task 1 — Identity contracts and native password hashing report

## Scope delivered

- Pinned the application runtime to Node `24.x` and added stable `next-auth@4.24.15` with its resolved lockfile entries.
- Added strict identity input contracts and e-mail normalization without importing environment configuration or database code.
- Added asynchronous native `node:crypto.argon2` Argon2id hashing with a versioned, bounded envelope and constant-time verification.

## Files changed

- `apps/web/package.json`
- `apps/web/package-lock.json`
- `apps/web/src/features/auth/contracts.js`
- `apps/web/src/features/auth/contracts.test.js`
- `apps/web/src/features/auth/password.js`
- `apps/web/src/features/auth/password.test.js`
- `.superpowers/sdd/2026-08-30-phase-2-identity-authorization/task-1-report.md`

## TDD evidence

### RED

Created `contracts.test.js` and `password.test.js` before the implementation. The focused command was then run:

```text
npm test -- --project unit src/features/auth/contracts.test.js src/features/auth/password.test.js
```

It failed as expected because both requested modules were absent:

```text
Failed to resolve import "@/features/auth/contracts"
Failed to resolve import "@/features/auth/password"
```

### GREEN

Implemented only the contracts and native Argon2id wrapper required by those tests. The same focused command then passed:

```text
Test Files  2 passed (2)
Tests  16 passed (16)
```

The test coverage proves trimmed names, lowercased trimmed e-mail, an `@...com` address, password boundaries, strict unknown-key rejection, generic public mutation result shapes, randomized salts, exact Argon2id envelope parameters, correct and incorrect password verification, malformed-hash rejection, and no plaintext password substring in the stored envelope.

## Commands and results

| Command | Result |
| --- | --- |
| `npm install next-auth@4.24.15` | Passed with `next-auth@4.24.15`; its lockfile peer range accepts Next 16. |
| `npm test -- --project unit src/features/auth/contracts.test.js src/features/auth/password.test.js` | Passed: 2 files, 16 tests. |
| `npm run test:unit` | Passed: 12 files, 73 tests. |
| `npm run typecheck` | Passed, exit 0. |
| `npm run lint` | Passed, exit 0. |
| `npm run build` | First sandboxed run failed only while fetching the pre-existing Google Geist fonts; rerun with network access passed, exit 0. |
| `npm audit --omit=dev` | First sandboxed request could not reach the npm advisory endpoint; rerun with network access passed: `found 0 vulnerabilities`. |
| `git diff --check` | Passed; no whitespace errors. |

## Decisions

- Used only `node:crypto` for password hashing. Node 24.11.1 exposes callback-based `argon2(algorithm, parameters, callback)`, so `deriveTag` wraps that API in a Promise to keep public functions asynchronous.
- The stored envelope is exactly `argon2id$v=1$m=65536,t=3,p=1$<16-byte-base64url-salt>$<32-byte-base64url-tag>`. The parser accepts only this version and parameter set, limits both encoded fields by anchored regular expression, and rechecks decoded byte lengths.
- Password tags are verified with `timingSafeEqual` after fixed-length parsing. A malformed envelope returns `false` before derivation.
- No secrets, customer data, real passwords, database connection, or environment access are needed during import or build.

## Self-review

- Inspected every changed source file and the dependency diff.
- Confirmed `package.json` has no Argon package and that the new hashing module imports `argon2`, `randomBytes`, and `timingSafeEqual` solely from `node:crypto`.
- Confirmed stable `next-auth@4.24.15` is exact-pinned in both root lockfile metadata and `package.json`; no beta release was used.
- The normal independent-review skill was not dispatched because the architect explicitly prohibited creating subagents for this task. This report and the scoped diff are ready for the architect's independent review.

## Remaining risks / concerns

- No task-scoped code concerns found. The first sandboxed build and audit could not access external endpoints, but both passed when rerun with authorized network access.
- This task intentionally does not configure Auth.js providers, secrets, routes, or persistence; later identity tasks must consume the frozen contracts and establish those integrations.
