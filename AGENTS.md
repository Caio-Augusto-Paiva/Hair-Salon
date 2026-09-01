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

## Required feature workflow

Every feature or behavior change follows this sequence:

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
