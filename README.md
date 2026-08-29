# Angelica's Beauty Salon

Next.js foundation for the Angelica's Beauty Salon scheduling platform in Juiz de Fora, Brazil.

## Repository structure

```text
.
├── AGENTS.md
├── INSTRUCOES_PROJETO.md
├── apps/
│   └── web/
├── docs/
│   └── superpowers/plans/
└── *.png / logoSalao.jpg
```

The application deployed to Vercel is located in `apps/web`.

## Prerequisites

- Node.js 24 or a compatible supported Node.js release
- npm
- Git

## Local setup

```powershell
Set-Location apps/web
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open `http://localhost:3000` after the development server starts.

## Verification

```powershell
Set-Location apps/web
npm run lint
npm run build
```

## Environment configuration

Use `apps/web/.env.example` as the variable inventory. Add real values only to `apps/web/.env.local` or the Vercel environment settings. Never commit real values.

## Vercel

Connect this GitHub repository to Vercel and configure `apps/web` as the Root Directory. Add production environment variables in Vercel before enabling database, authentication, Calendar, or email integrations.

## Agent execution

Codex agents must read `AGENTS.md`, `INSTRUCOES_PROJETO.md`, and the relevant file under `docs/superpowers/plans/` before implementation. The architect agent assigns isolated tasks to frontend, backend, and database agents and verifies every returned change.
