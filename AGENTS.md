# Angelica's Beauty Salon Agent Guide

## Source of truth

Read `INSTRUCOES_PROJETO.md` before planning or changing code. It defines the product, business rules, non-functional requirements, privacy policy, agent roles, and required skills. If code and specification disagree, stop and report the conflict to the architect agent.

## Repository layout

- `apps/web/`: deployable Next.js application. Run npm commands from this directory.
- `docs/superpowers/plans/`: approved implementation plans.
- `docs/frontend/ANIMACOES_REFERENCIAS.md`: owner-curated motion references and the required frontend animation decision log.
- Root image files: immutable source copies supplied by the owner.
- `apps/web/public/images/`: frontend-ready copies of approved assets.

The Vercel project root directory is `apps/web`.

## Just-in-time feature workflow

Follow this lifecycle in order, loading each skill only when its stage begins:

```text
$brainstorming
→ $writing-plans
→ $using-git-worktrees
→ $test-driven-development
→ implementation
→ $requesting-code-review
→ $verification-before-completion
→ $finishing-a-development-branch
```

Use `$brainstorming` only when a behavior or architectural decision is not already approved. Use `$writing-plans` only after approval for a multi-step change, `$using-git-worktrees` when execution begins, and `$test-driven-development` for each production behavior. Finish each meaningful batch with review and verification; use `$finishing-a-development-branch` only after all gates are green.

Use `$systematic-debugging` before proposing a fix for any bug, failed test, build error, integration issue, or unexpected performance result.

## Required interface workflows

For a new interface:

```text
$brainstorming
→ $ui-ux-pro-max
→ $impeccable shape
→ $design-system
→ $ui-styling
→ $impeccable polish
→ visual verification
```

For an existing interface:

```text
$impeccable critique
→ $ui-ux-pro-max
→ $impeccable [clarify/layout/adapt/harden]
→ $impeccable polish
```

Do not use `$huashu-design` to implement the production application. It may be used only for approved standalone HTML visual prototypes; production UI remains Next.js/React.

## Supabase boundary

- Supabase is only the managed PostgreSQL provider. Auth.js and the Next.js server remain the identity and application boundaries.
- Runtime server code uses `DATABASE_URL` through Supavisor transaction mode with a small bounded pool and no dependency on session state or named prepared statements.
- Migrations, schema inspection, backup/restore, and controlled administration use `DATABASE_DIRECT_URL`; Supavisor session mode is the approved fallback when the direct IPv6 endpoint is unavailable.
- Keep Drizzle, `pg`, Testcontainers, and versioned SQL migrations. Do not introduce Supabase Auth, browser clients, Data API/PostgREST, Realtime, Edge Functions, or Storage without a separately approved design.
- Never run migrations during a request or module import. PostgreSQL 17 integration and concurrency tests remain isolated from Supabase.

## Context and delegation

- Read `INSTRUCOES_PROJETO.md` once at task start, then prefer targeted searches and bounded excerpts. Filter long logs, generated output, and lockfiles before loading them into context.
- Small documentation changes and sequential database or backend tasks stay with the main agent. Use subagents only for genuinely independent work with non-overlapping files.
- When subagents are used, announce their scopes and permitted files, report their evidence, inspect every diff, and rerun the relevant verification independently.

Before proposing or implementing frontend motion, read `docs/frontend/ANIMACOES_REFERENCIAS.md`. The frontend agent must compare only the references relevant to the current surface, record the selected or rejected direction, and verify reduced motion, keyboard behavior, responsive performance, and absence of layout shift.

## Agent boundaries

- **Architect agent:** owns decomposition, contracts, integration order, review gates, and final verification.
- **Frontend agent:** owns React/Next.js pages, components, accessibility, responsive behavior, themes, and image presentation.
- **Backend agent:** owns authentication, authorization, Server Actions/route handlers, scheduling rules, integrations, and email workflows.
- **Database agent:** owns PostgreSQL schema, migrations, constraints, indexes, transaction semantics, and backup guidance.

Agents must not edit the same file concurrently. Any shared contract must be defined by the architect before dependent work begins. Each agent reports changed files, commands run, evidence, decisions, and remaining risks.

## Quality gates

From `apps/web`, run at minimum:

```powershell
npm run lint
npm run build
```

Feature tasks must add tests before production code and must execute the relevant test suite. Never claim completion from a subagent report alone; inspect the diff and rerun verification independently.

## Security rules

- Never commit `.env*` files except `.env.example`.
- Never place real credentials, tokens, customer data, card data, or valid PIX payloads in prompts, source files, tests, logs, screenshots, or commits.
- Enforce authorization and scheduling rules on the server and database, not only in the browser.
- Reserved slots must not expose customer identity in the public agenda.
