# CareerProof

Truthful, targeted resumes and cover letters. Users build a **Career Vault** of facts they confirm; every generated line cites those facts and is fact-checked before it can be downloaded.

- **Going live: [`LAUNCH.md`](LAUNCH.md)** (the short checklist)
- Product spec: [`SPEC.md`](SPEC.md)
- Build plan, decisions and progress: [`PLAN.md`](PLAN.md)

## Stack

Next.js 16 (App Router, Cache Components) · TypeScript (strict) · Tailwind CSS 4 + shadcn/ui-style components on Radix · Supabase (Auth, Postgres with RLS, Storage) · Anthropic API (server only) · Zod · Stripe · Vitest · Playwright.

## Local setup

Requirements: Node 22+, Docker (for the local Supabase stack).

```bash
npm install
cp .env.example .env.local
npm run db:start          # starts local Supabase and applies supabase/migrations
```

`npm run db:start` prints the local API URL and keys. Put them in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>
NEXT_PUBLIC_CONTACT_EMAIL=you@example.com
```

Then:

```bash
npm run dev               # http://localhost:3000
```

Sign-in emails don't leave your machine locally: open Mailpit at http://127.0.0.1:54324 to click the magic link.

### AI

- With `ANTHROPIC_API_KEY` set and `AI_PROVIDER=anthropic` (the default), the app calls Claude from the server only. Resume reading, posting analysis and resume writing use `AI_MODEL_DEFAULT`; turning answers into facts uses `AI_MODEL_FAST`.
- `AI_PROVIDER=mock` replays the recorded responses in `tests/fixtures/ai/` and never calls the API. The E2E suite uses it. A request with no recording fails loudly; it never makes something up.
- `npm run test:live` runs the AI tasks against the real API and checks the same rules as the unit tests. It is skipped when no key is set.
- Each user is limited to 10 AI requests a minute, 200 a day, and `AI_MONTHLY_COST_CAP_USD` of spend a month.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | Generates route types, then `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Vitest) |
| `npm run test:rls` | Row Level Security tests: runs the migrations in a throwaway database and checks user A can't read or write user B's rows. Uses `RLS_DB_URL` (default `postgres://postgres:postgres@127.0.0.1:5432/postgres`; with the Supabase stack use port `54322`). |
| `npm run test:e2e` | Playwright, desktop and 375×812 mobile, against a production build. Needs the local Supabase stack running. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use an existing Chromium. |
| `npm run db:start` / `db:reset` | Local Supabase stack / re-apply migrations from scratch |
| `npm run db:types` | Regenerate `lib/supabase/database.types.ts` from the local database |

## Deploying (Vercel + Supabase cloud)

Follow [`LAUNCH.md`](LAUNCH.md) for the current private v1.0 launch, environment variables, access protection, cost approval and acceptance checks. [`LAUNCH_STATUS.md`](LAUNCH_STATUS.md) records what has actually been verified. Historical build milestones in `PLAN.md` do not mean production is ready.

Stripe, Google OAuth, custom domains and analytics are optional and postponed for personal testing. Cover letters are included for Free accounts in the current launch change; imports and applications retain their existing limits.

### Analytics (optional)

Set `NEXT_PUBLIC_ANALYTICS_DOMAIN` to turn on cookie-free page analytics (Plausible, or a compatible service via `NEXT_PUBLIC_ANALYTICS_SRC`). Only page views and a few named events are counted: resume imported, application created, resume written, resume downloaded, upgrade started. No resume, vault or posting content is ever sent.

Implementation history is in `PLAN.md`; current release blockers and verification are in `LAUNCH_STATUS.md`.
