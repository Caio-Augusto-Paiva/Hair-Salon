# Proveras Platform Design

**Date:** 2026-08-30  
**Status:** Approved by the owner on 2026-08-30  
**Source of truth:** `INSTRUCOES_PROJETO.md` in the working tree

## 1. Purpose and scope

Build the complete Proveras scheduling platform for Angelica's Beauty Salon as a deployable Next.js application backed by PostgreSQL. The product includes the public site, authentication, client booking, employee and administrator workspaces, privacy workflows, resilient external integrations, automated tests, operational documentation, and Vercel readiness.

The implementation preserves the current JavaScript Next.js foundation in `apps/web`. It does not process real PIX or card payments, publish to Vercel, use real credentials, or mutate the owner's source images.

The local uncommitted change that names the product **Proveras** remains owner-controlled and must not be included in task commits. The required logo alternative text remains **Angelica's Beauty Salon**.

## 2. Chosen architecture

Use a modular monolith in the existing Next.js App Router application:

- **Views:** route pages and React components under `src/app` and feature-local UI folders.
- **ViewModels:** form state, display transformations, validation results, and interaction state under each feature.
- **Models:** domain services, repositories, database schema, and integration adapters in server-only modules.
- **Mutations:** Server Actions for first-party UI mutations; Route Handlers for Auth.js, exports, cron, readiness, and integration callbacks.
- **Persistence:** PostgreSQL through Drizzle ORM and versioned SQL migrations.
- **Identity:** Auth.js with credentials and configurable Google OAuth, JWT sessions in secure cookies, and server-side role/status checks.
- **External effects:** transactional outbox processed by authenticated jobs with idempotent adapters.

This architecture keeps booking transactions and their invariants in one runtime and database while retaining explicit module boundaries. A separate API service would add deployment and contract overhead; a BaaS-first design would make the required PostgreSQL concurrency rules and session semantics less explicit.

## 3. Module boundaries

```text
src/
├── app/                         # Next.js routes, layouts, handlers
├── components/                  # Shared presentational components
├── features/
│   ├── auth/                    # Signup, login, reset, authorization
│   ├── catalog/                 # Services and portfolio presentation
│   ├── scheduling/              # Availability, booking, blocks, cancellation
│   ├── account/                 # Profile and appointment history
│   ├── employee/                # Employee workspace
│   ├── admin/                   # Administrator workspace
│   ├── privacy/                 # Policy and LGPD requests
│   └── integrations/            # Calendar, email, reminders, Excel
├── db/                          # Connection, schema, repositories
├── lib/                         # Environment, errors, dates, security
└── test/                        # Shared test helpers and fixtures

drizzle/                         # Ordered SQL migrations
e2e/                             # Playwright user stories
docs/                            # Setup, operation, backup, release readiness
```

Client Components may import feature ViewModels and presentation contracts but never database clients, secrets, password helpers, authorization repositories, or private appointment records. Server-only modules use the `server-only` guard.

## 4. Shared domain contracts

All untrusted input is validated with Zod on the server. Client-side use of the same schema improves feedback but is never an authorization boundary.

### 4.1 Roles and statuses

```js
const UserRole = ["CLIENT", "EMPLOYEE", "ADMIN"];
const UserStatus = ["ACTIVE", "DISABLED"];
const ScheduleEntryKind = ["APPOINTMENT", "BLOCK"];
const ScheduleEntryStatus = ["ACTIVE", "CANCELLED"];
const AppointmentStatus = ["CONFIRMED", "CANCELLED"];
const PaymentMethod = ["CASH", "PIX", "CARD"];
const PrivacyRequestStatus = ["OPEN", "IN_REVIEW", "COMPLETED", "REJECTED"];
```

PIX and CARD are visible choices but disabled capabilities. They cannot reach booking persistence while disabled. Confirmed appointments therefore store CASH until an administrator enables a future, separately approved payment implementation.

### 4.2 Public availability

```js
{
  employeeId: "uuid",
  serviceId: "uuid",
  businessDate: "YYYY-MM-DD",
  timeZone: "America/Sao_Paulo",
  slots: [
    {
      startsAt: "ISO-8601 instant",
      endsAt: "ISO-8601 instant",
      available: true,
      unavailableLabel: null
    }
  ],
  nextAvailableStartsAt: "ISO-8601 instant | null"
}
```

For unavailable slots, the only public replacement fields are `available: false` and `unavailableLabel: "Horário indisponível"`. Public availability never returns appointment IDs, client IDs, names, e-mails, payment methods, services booked by another client, or block reasons.

### 4.3 Mutation result

```js
{
  ok: true,
  data: {},
  fieldErrors: {},
  formError: null,
  code: "STABLE_MACHINE_CODE"
}
```

Failures use `ok: false`, omit private data, and return stable codes including `UNAUTHENTICATED`, `FORBIDDEN`, `VALIDATION_FAILED`, `SLOT_UNAVAILABLE`, `MINIMUM_NOTICE`, `NO_CANCELLATION_CREDIT`, and `INTEGRATION_PENDING`.

## 5. Data model

### Identity

- `users`: id, name, normalized e-mail, password hash when credentials are enabled, role, status, session version, timestamps.
- `accounts`: Auth.js OAuth account linkage; no provider access token is exposed to clients.
- `password_reset_tokens`: user, SHA-256 token hash, expiration, consumed time, creation metadata.
- `auth_events`: security-relevant login, logout, reset, role, and status events without secrets.

### Catalog and staff

- `employees`: user reference, display name, specialty summary, active status, optional calendar identifier.
- `services`: name, category, duration in minutes, preparation time, price in integer cents, active status.
- `employee_services`: enabled employee/service pairs and optional duration override.
- `portfolio_items`: immutable public asset path, category, alternative text, display order, active status.

### Scheduling

- `schedule_entries`: employee, start, end, kind, status, creator, timestamps.
- `appointments`: one-to-one active schedule entry, client, service snapshot, price snapshot, payment method, status, cancellation metadata.
- `schedule_blocks`: one-to-one block schedule entry, administrative reason, recurrence source when applicable.
- `cancellation_credits`: exactly three numbered rows per client, each with `available_at` and last appointment use.

### Operations and privacy

- `integration_outbox`: event type, aggregate ID, idempotency key, payload containing minimum necessary data, attempts, next attempt, terminal state.
- `calendar_syncs`: appointment/event mapping and last provider outcome.
- `reminder_deliveries`: appointment, scheduled time, channel, outcome, idempotency key.
- `privacy_requests`: protocol, contact data, request type, status, due date, resolution metadata.
- `audit_log`: actor, action, target type/ID, timestamp, and sanitized metadata.

Sensitive timestamps use PostgreSQL `timestamptz`. Money uses integer cents. Business date calculations occur in `America/Sao_Paulo`; storage and integration payloads use unambiguous instants.

## 6. Database-enforced scheduling invariants

`schedule_entries` is the single collision surface for appointments and administrator blocks. The initial migration enables `btree_gist` and adds the equivalent of:

```sql
ALTER TABLE schedule_entries
  ADD CONSTRAINT schedule_entries_no_employee_overlap
  EXCLUDE USING gist (
    employee_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
  WHERE (status = 'ACTIVE');
```

Additional checks require `ends_at > starts_at`, valid enum values, and non-negative price/duration values. Unique constraints enforce one appointment or block detail per schedule entry, unique normalized e-mails, unique OAuth accounts, three numbered credit slots per client, and idempotent outbox operations.

### Booking transaction

1. Authorize the actor and load active employee/service records.
2. Convert the requested local wall time using `America/Sao_Paulo` and reject ambiguous or invalid input.
3. Enforce at least two hours of lead time.
4. Calculate end time from the enabled employee/service duration.
5. Insert the active schedule entry; translate exclusion violations to `SLOT_UNAVAILABLE`.
6. Insert the private appointment and required outbox events.
7. Commit, then refresh availability and show the next valid slot.

The application may pre-check availability for friendly feedback, but only the exclusion constraint decides the race.

### Cancellation transaction

1. Lock the appointment and verify client ownership or employee/admin authority.
2. For client cancellation, lock the earliest credit with `available_at <= now()`.
3. Reject when no credit is available and return the three renewal dates.
4. Set the chosen credit's `available_at` to cancellation time plus 30 days.
5. Cancel appointment and schedule entry and enqueue external cancellation effects.
6. Commit so the interval becomes immediately reusable.

Employee/admin deletion follows authorization rules and is recorded in the audit log. Whether it consumes a client credit is fixed as **no**, because the client did not initiate the cancellation.

## 7. Authentication and authorization

- Credentials signup creates CLIENT users only and hashes passwords with Argon2id.
- ADMIN creates EMPLOYEE accounts through an admin-only server mutation.
- Google OAuth is displayed only when complete provider configuration is present.
- JWT session cookies are `HttpOnly`, `Secure` in non-local environments, `SameSite=Lax`, and scoped to the application path.
- JWT claims carry only user ID, role, session version, and expiration.
- Every protected data access reloads the user's current status, role, and session version; disabling an account or incrementing the version invalidates old sessions.
- Route gating improves navigation but never replaces authorization in Server Actions, Route Handlers, services, and repositories.
- Password reset uses a cryptographically random token delivered by the e-mail adapter. Only its hash is stored. Tokens expire within 24 hours and are consumed atomically once.
- Authentication endpoints use rate limits keyed by privacy-preserving request attributes and return non-enumerating messages.

## 8. Availability and user experience

The specification's default is availability every day and every hour except active blocks and appointments. The system therefore begins with full-day availability and lets administrators create one-time or recurring blocks for closure and absence. The data model can later support explicit opening windows without changing booking contracts.

The booking flow is:

1. Choose employee.
2. Choose an enabled service and see price/duration.
3. Choose date and available start time.
4. Review calculated end time and next consecutive option.
5. Choose payment; PIX and CARD show the exact required blocked messages and cannot submit card/PIX data.
6. Confirm CASH booking.
7. Receive confirmation and refreshed availability without a full page reload.

Two services remain two separately confirmed appointments. After the first succeeds, the UI preselects the first valid next slot but does not reserve it until the second transaction commits.

Every interaction shows feedback within 500 ms through pending, success, or error state. The design system uses primitive, semantic, and component tokens for the required light and dark palettes, accessible focus, minimum touch targets, reduced-motion support, responsive layouts, and non-color-only status communication.

## 9. Pages and access

- `/`: public salon presentation, services, portfolio, booking and WhatsApp calls to action.
- `/entrar`, `/cadastro`, `/recuperar-senha`, `/redefinir-senha`: identity flows.
- `/agendar`: client booking flow; authentication required before confirmation.
- `/conta`: client profile, future appointments, history, cancellation credits.
- `/funcionaria`: employee-only personal agenda and authorized appointment management.
- `/admin`: admin overview, all schedules, employees, services, blocks, exports, privacy requests, integration health, and readiness.
- `/privacidade`: public policy and privacy request form with protocol response.
- `/api/auth/*`: Auth.js handlers.
- `/api/export/agenda`: authorized `.xlsx` response.
- `/api/cron/outbox` and `/api/cron/reminders`: secret-authenticated jobs.
- `/api/readiness`: non-secret configuration readiness status restricted to ADMIN outside test environments.

## 10. External integrations

All integrations implement a small interface and have production, disabled, and deterministic test adapters.

### Google Calendar

The database remains the source of truth. A worker consumes idempotent create/update/cancel events. Each employee may have a calendar ID; a configured salon-wide ID is the fallback. Provider failures record attempts and retry without rolling back appointments.

### Transactional e-mail

The production adapter sends password-reset and appointment-reminder messages through a configured provider. A capture adapter records deterministic messages in tests. Missing provider configuration disables sending and makes release readiness fail without breaking local booking.

### Excel

An authorized server handler produces `.xlsx` output with the minimum columns appropriate to the requesting role. Clients have no export permission; employees receive only their appointments; administrators receive salon-wide operational data.

### WhatsApp

The public number is normalized to digits in international format and rendered as a `wa.me` URL only after validation. Readiness remains false until the administrator confirms the number.

## 11. LGPD and retention

- The public privacy policy reproduces the approved source text and marks legal validation as a release prerequisite.
- Requests generate an opaque protocol and enter the admin workflow without exposing request lists publicly.
- Data access and export follow least privilege.
- Retention jobs are designed around the source-of-truth periods: account/history and payment/cancellation metadata five years, technical logs six months, reset tokens at most 24 hours, and backups at most 90 days.
- Automated deletion is dry-run capable and cannot be enabled in production until administrative/legal validation is recorded.

## 12. Testing strategy

- **Unit:** Vitest for schemas, time calculations, duration, next-slot search, payment blocking, credit renewal, adapters, and view models.
- **Component:** React Testing Library for forms, navigation, status feedback, privacy-safe slot rendering, themes, and keyboard behavior.
- **PostgreSQL integration:** migrations applied to a real PostgreSQL instance; concurrent inserts, partial overlaps, different employees, blocks, cancellation release, credit locking, idempotency, and authorization queries.
- **Route/action integration:** session expiry, every role boundary, reset token expiry/use-once, exports, Calendar/e-mail failure handling, readiness.
- **End to end:** Playwright for public browsing, signup/login, booking, client cancellation, employee agenda, admin management, privacy request, and blocked payment choices.
- **Accessibility:** automated axe checks plus keyboard, focus, landmarks, labels, contrast, and overflow inspection.
- **Full-story verification:** browser trigger to server mutation to PostgreSQL evidence to rendered response for each critical flow.

PostgreSQL concurrency tests must run against a real server through Testcontainers or a CI PostgreSQL service. They may not be replaced by mocks or silently skipped.

## 13. Delivery waves and ownership

1. **Contracts and database:** architect freezes contracts; database agent owns schema, migrations, repositories, fixtures, and real concurrency tests.
2. **Identity and authorization:** backend agent owns auth, sessions, password reset, role guards, and integration tests.
3. **Scheduling domain:** backend and database work sequentially on shared transaction contracts; frontend builds only against frozen public contracts.
4. **Public and client experience:** frontend owns design tokens, shared UI, home, portfolio, identity forms, booking, account, and component/E2E tests.
5. **Employee and admin experience:** frontend owns workspaces; backend owns authorized mutations and exports.
6. **Integrations and privacy:** backend owns adapters/outbox/readiness; frontend owns admin health and privacy surfaces.
7. **Quality and release:** architect integrates, reruns all gates, performs browser verification, audits secrets/privacy, updates operation docs, and produces the retained-template Operating Review deck.

Agents receive isolated briefs with permitted files, frozen input/output contracts, mandatory skills, test commands, and report format. Agents never edit the same file concurrently. The architect inspects every diff and independently reruns relevant verification.

## 14. Quality gates

Each wave must satisfy its relevant tests plus:

```powershell
npm run test
npm run test:integration
npm run test:e2e
npm run lint
npm run typecheck
npm run build
git diff --check
```

Commands absent before a wave are added by the task that introduces the corresponding capability. Failures trigger systematic debugging before any fix. Significant tasks receive independent specification and code-quality review. Completion requires no critical or important review findings.

## 15. Release readiness and external blockers

The implementation exposes a readiness report that checks presence and coherent combinations of environment variables without revealing values. Publication remains blocked until the administrator supplies or validates:

- managed PostgreSQL with pooled production connection;
- Auth secret and Google OAuth credentials if Google login is enabled;
- Google Calendar authorization and global/per-employee calendar mapping;
- transactional e-mail provider, sender, and domain authentication;
- final service prices, staff accounts, specialties, and enabled services;
- WhatsApp number and address;
- legal approval of privacy policy, retention, and request channel;
- backup provider, restore drill evidence, and production monitoring;
- manual Chrome, Edge, Firefox, Safari, and mobile validation.

Missing external configuration is represented explicitly as disabled adapters or failed readiness items, never as invented credentials or hidden success.

## 16. Final evidence package

The final handoff contains architecture, routes and flows, schema and concurrency proof, changed files, exact commands/results, environment and operational configuration, external blockers, remaining risks, branch/worktree location, and safe integration options. It also contains an Operating Review presentation cloned from the retained reference template and populated only with verified scorecards, decisions, risks, and action items.
