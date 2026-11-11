# Supabase Database and Codex Efficiency Design

**Date:** 2026-08-31  
**Status:** Approved direction; written specification awaiting owner review

## 1. Purpose

Adopt Supabase as the managed PostgreSQL provider for Proveras without replacing the existing application architecture, authentication strategy, database invariants, or completed foundation work. At the same time, reduce Codex token consumption by loading skills and context only when the current task requires them.

This change does not restart the project. Phase 0 remains complete, the approved domain model remains valid, and Phase 1 is revised only where provider-specific connection and operating details change.

## 2. Architecture decision

The Next.js application remains the only application backend. Server Actions and Route Handlers authorize requests, validate input, execute business rules, and call server-only repositories. Auth.js continues to provide credentials login, optional Google OAuth, JWT sessions in secure cookies, recovery flows, and role enforcement.

Supabase is used only as the managed PostgreSQL provider. The application continues to use Drizzle ORM, `pg`, versioned SQL migrations, and native PostgreSQL constraints. Supabase Auth, the browser Supabase client, Data API/PostgREST, Realtime, Edge Functions, and Storage are not part of the current architecture. They may be evaluated later only through a separate approved design.

The database remains the source of truth. In particular, the `schedule_entries_no_employee_overlap` GiST exclusion constraint remains the final defense against overlapping appointments and blocks. Row Level Security is not the primary authorization boundary because application clients never query Supabase directly. Database roles, least-privilege credentials, and server-side authorization still apply.

## 3. Connection model

Production uses two environment variables with different responsibilities:

- `DATABASE_URL`: Supabase Supavisor transaction-mode connection used by the Next.js runtime on Vercel. Runtime code must not depend on session state or named prepared statements.
- `DATABASE_DIRECT_URL`: direct Supabase PostgreSQL connection used for migrations, schema inspection, backup/restore, and controlled administrative operations. If the execution environment cannot reach the IPv6 direct endpoint, the approved fallback is the Supavisor session-mode connection.

Both variables contain secrets and must exist only in local or deployment environment configuration. `.env.example` lists their names without values. No Supabase project URL, database password, service-role key, connection string, or customer data may be committed or copied into prompts, logs, screenshots, fixtures, or test output.

The application-side `pg.Pool` remains bounded. Its maximum size is deliberately small because Supavisor already pools server-side connections. Migrations must use `DATABASE_DIRECT_URL`, must run as an explicit deployment step, and must never run opportunistically during an application request or module import.

## 4. Development and test environments

Local unit tests remain independent of Supabase. PostgreSQL integration and concurrency tests continue to start an isolated PostgreSQL 17 container through Testcontainers. They must prove migrations, extensions, exclusion constraints, transactions, concurrent booking behavior, cancellation credits, and idempotency without contacting the production Supabase project.

The local development application may use either an isolated local PostgreSQL database or a dedicated non-production Supabase project. It must never use the production database. Seed commands require an explicit development-only guard and contain only fictitious data.

The first Supabase provisioning checklist is:

1. Create separate development and production projects in a suitable region.
2. Record runtime and direct/session connection strings only in an approved secret manager and the corresponding Vercel environments.
3. Enable required extensions through versioned migrations, including `btree_gist` and `pgcrypto`.
4. Apply migrations through the direct or session connection.
5. Verify constraints and migration bookkeeping before deploying application traffic.
6. Configure backup retention and perform a documented restore rehearsal before launch.

## 5. Privacy and operations

The privacy policy must name Supabase as the managed PostgreSQL infrastructure operator while preserving the salon as data controller. The policy must not claim that Supabase Auth or other unused Supabase products process identity data on behalf of the application.

Operational documentation must record the selected project regions, retention and backup settings, connection mode, responsible owner, incident contacts, and restore procedure. These values are deployment records, not source-code secrets.

## 6. Token-efficient Codex workflow

Skills are invoked just in time. A prompt must describe the desired outcome, relevant constraints, acceptance evidence, and permitted scope; it must not activate every skill that might eventually appear in the lifecycle.

The default sequence is:

1. Use `$brainstorming` only when a request introduces or changes behavior and a design decision is still required.
2. Use `$writing-plans` only after an architectural design or multi-step specification has been approved.
3. Use `$using-git-worktrees` only when execution of an approved implementation plan begins.
4. Use `$test-driven-development` while implementing each behavior change.
5. Use `$systematic-debugging` only after an actual failure or unexpected result occurs.
6. Use domain/UI skills only for the files and decisions they govern.
7. Use `$requesting-code-review` and `$verification-before-completion` at the end of a meaningful implementation batch.
8. Use `$finishing-a-development-branch` only after verification is green.
9. Use `$vercel:verification` only when a runnable application or deployment flow exists to verify.

Agents read `INSTRUCOES_PROJETO.md` once at task start, then use targeted searches and bounded excerpts for later lookups. Large files, logs, test output, generated artifacts, and lockfiles are filtered before entering model context. Commands use concise output unless additional evidence is necessary.

Repeated workflow prose is replaced by a single canonical policy plus short references. Historical completed plans remain unchanged unless a statement would direct unfinished work incorrectly. Active plans are amended rather than replaced so completed progress and commit history remain intact.

## 7. Subagent policy and visibility

Subagents are optional execution workers, not separate user-visible chats. Their work normally remains inside the current Codex task, so the absence of new conversation tabs does not show that they were not used.

The architect may dispatch subagents only when two or more tasks are genuinely independent, their permitted files do not overlap, and the expected saving in elapsed time justifies duplicating context. Small documentation changes, sequential database work, and tightly coupled features stay with the main agent.

Whenever subagents are used, the main agent must:

- announce the dispatch in commentary, naming each bounded responsibility;
- avoid sending the entire conversation when a concise isolated brief is sufficient;
- report which agents completed, which files they changed, and what evidence they produced;
- inspect every diff and independently rerun the relevant verification before claiming completion.

This makes subagent activity auditable without requiring separate conversations. If no dispatch is announced, the user should assume the main agent is working inline.

## 8. Frontend animation direction

Animation is a progressive enhancement and will be designed during the relevant interface workflow, not added as a global dependency during the database change. The preferred motion language is restrained and functional:

- short page and section entrances using opacity and small vertical displacement;
- clear hover, press, focus, pending, success, and error transitions;
- gentle modal, drawer, agenda-selection, and theme-toggle transitions;
- optional decorative motion only in the public hero or portfolio, never in booking-critical controls;
- skeletons or localized progress indicators for asynchronous work instead of blocking full-page animation.

Implementation should prefer CSS transitions and transforms for simple effects. A React animation library may be introduced only when coordinated presence, layout, or gesture animation materially improves the experience. All motion must honor `prefers-reduced-motion`, preserve keyboard focus, avoid layout shift, remain smooth on representative mobile hardware, and never delay confirmation of an appointment.

Animation acceptance evidence will include desktop and mobile visual checks, light and dark themes, reduced-motion behavior, keyboard navigation, absence of horizontal overflow, and no console errors. The exact animation system and dependency choice require a separate interface design approval when the affected screen is scheduled for implementation.

## 9. Files affected after approval

- `INSTRUCOES_PROJETO.md`: provider decision, privacy language, deployment dependencies, and canonical token-efficient workflow.
- `AGENTS.md`: just-in-time skill routing, selective context rules, and explicit subagent visibility requirements.
- `docs/superpowers/specs/2026-08-30-proveras-platform-design.md`: Supabase provider boundary, dual connection model, unchanged Auth.js design, and runtime restrictions.
- `docs/superpowers/plans/2026-08-30-phase-1-data-contracts.md`: runtime/direct connection contracts, migration commands, environment names, and provider verification.
- `apps/web/.env.example`: empty `DATABASE_DIRECT_URL` entry and comments distinguishing runtime from migration use.

The completed Phase 0 plan is historical evidence and will not be rewritten. Existing owner changes in `INSTRUCOES_PROJETO.md` must be preserved while applying this update.

## 10. Acceptance criteria

- Documentation consistently identifies Supabase only as the managed PostgreSQL provider.
- Auth.js and the Next.js server remain the identity and application boundaries.
- Runtime and migration connections have distinct documented purposes.
- No secret or real Supabase identifier is added to the repository.
- PostgreSQL concurrency guarantees and Testcontainers coverage remain unchanged.
- Agent instructions load skills in lifecycle order and no longer require blanket activation in the first prompt.
- Subagent use is visible through commentary and completion reports but is not mandatory for small tasks.
- Animation guidance is accessible, performance-conscious, and explicitly deferred to the interface workflow.
- Current project progress and existing uncommitted owner work are preserved.
