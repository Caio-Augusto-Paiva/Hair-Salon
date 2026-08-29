# Phase 0 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a versioned, verifiable Next.js foundation for Angelica's Beauty Salon, ready for coordinated Codex agents.

**Architecture:** Keep the product specification and agent instructions at the repository root and place the deployable Next.js application in `apps/web`. Use the App Router with JavaScript, Tailwind CSS and ESLint; public brand assets live under `apps/web/public/images` and secrets are represented only by `.env.example`.

**Tech Stack:** Git, Node.js 24, npm, Next.js App Router, React, JavaScript, Tailwind CSS, ESLint.

**Spec:** `INSTRUCOES_PROJETO.md`

## Global Constraints

- Front-end must use React through Next.js and back-end code must use JavaScript.
- Production hosting target is Vercel; the application root is `apps/web`.
- Brand assets must preserve their supplied filenames and use `next/image` when rendered.
- Real credentials must never be committed; `.env.example` contains names only.
- Feature work after this foundation follows the skill gates in section 11 of the specification.

---

### Task 1: Repository baseline

**Files:**
- Create: `.gitignore`
- Create: `docs/superpowers/plans/2026-08-29-phase-0-foundation.md`
- Preserve: `INSTRUCOES_PROJETO.md`
- Preserve: root image assets until Task 3 copies them into the application

**Interfaces:**
- Consumes: empty GitHub repository `Caio-Augusto-Paiva/Hair-Salon` and the local specification/assets.
- Produces: `main` baseline commit and ignored `.worktrees/` directory.

- [x] Initialize Git on branch `main`, add the GitHub remote and verify `.worktrees/` is ignored.
- [x] Commit the specification, source images, ignore rules and this plan as the baseline.
- [x] Create worktree branch `phase-0-foundation` under `.worktrees/phase-0-foundation`.

### Task 2: Next.js application scaffold

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/next.config.mjs`
- Create: `apps/web/jsconfig.json`
- Create: `apps/web/src/app/layout.js`
- Create: `apps/web/src/app/page.js`
- Create: `apps/web/src/app/globals.css`

**Interfaces:**
- Consumes: Node.js/npm and Next.js App Router conventions.
- Produces: commands `npm run dev`, `npm run lint` and `npm run build` from `apps/web`.

- [x] Generate the Next.js application with JavaScript, App Router, `src/`, Tailwind, ESLint and alias `@/*`.
- [x] Run `npm run lint` and record the exit status.
- [x] Run `npm run build` and record the exit status.

### Task 3: Project assets and Codex operating contract

**Files:**
- Create: `AGENTS.md`
- Create: `README.md`
- Create: `apps/web/.env.example`
- Create: `apps/web/public/images/logo/logoSalao.jpg`
- Create: `apps/web/public/images/portfolio/*.png`

**Interfaces:**
- Consumes: agent workflow from specification section 11 and supplied logo/portfolio files.
- Produces: stable instructions discoverable by Codex, documented setup and public image paths.

- [x] Copy the supplied logo and all twelve portfolio images into their specified public directories without renaming them.
- [x] Create `.env.example` with `DATABASE_URL`, `AUTH_SECRET`, Google OAuth/Calendar, email and WhatsApp variable names but no values.
- [x] Create `AGENTS.md` defining the architect, front-end, back-end and database scopes, required skills, shared-file policy and verification gates.
- [x] Create `README.md` with prerequisites, install, development, lint, build, environment and Vercel root-directory instructions.

### Task 4: Foundation verification

**Files:**
- Verify: repository tree and Git diff
- Verify: `apps/web/package.json`
- Verify: `apps/web/public/images/**`

**Interfaces:**
- Consumes: all Phase 0 artifacts.
- Produces: evidence that the foundation installs, lints and builds and that all required source assets exist.

- [x] Run `npm install` in `apps/web` from the worktree.
- [x] Run the full `npm run lint` command and require exit code 0.
- [x] Run the full `npm run build` command and require exit code 0.
- [x] Verify one logo plus twelve portfolio images are present under `apps/web/public/images`.
- [x] Review `git status --short` and `git diff --check` before committing the Phase 0 branch.
- [x] Commit the verified foundation on `phase-0-foundation` and present branch-integration options.
