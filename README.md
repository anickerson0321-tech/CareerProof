# CareerProof

Truthful, targeted resumes and cover letters. Users build a **Career Vault** of facts they confirm; every generated line cites those facts and is fact-checked before it can be downloaded.

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

1. **Supabase:** create a project. In the SQL editor, or with `npx supabase link` then `npx supabase db push`, apply everything in `supabase/migrations`.
2. **Auth URLs:** Supabase → Authentication → URL Configuration: set Site URL to your domain and add `https://<your-domain>/**` to Redirect URLs.
3. **Google sign-in:** Google Cloud Console → APIs & Services → Credentials → Create OAuth client (Web). Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`. Paste the client ID and secret into Supabase → Authentication → Providers → Google.
4. **Stripe** (start in Test mode):
   - Products → add **Pro** with two recurring prices (for example $12/month and $96/year). Copy the price ids into `STRIPE_PRICE_PRO_MONTHLY` and `STRIPE_PRICE_PRO_YEARLY`.
   - Developers → API keys → secret key into `STRIPE_SECRET_KEY`.
   - Developers → Webhooks → add endpoint `https://<your-domain>/api/stripe/webhook` with the events `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated` and `customer.subscription.deleted`. Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
   - Settings → Billing → Customer portal: turn it on, and allow cancelling and switching between the two Pro prices.
   - Locally: `stripe listen --forward-to localhost:3000/api/stripe/webhook` prints a `whsec_…` secret for `.env.local`. Test card: 4242 4242 4242 4242, any future date, any CVC.
5. **Vercel:** import the repo and add every variable from `.env.example` (Production and Preview). Deploy.

Milestone status and anything still missing are tracked in `PLAN.md`.
