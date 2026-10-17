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

1. **Supabase:** create a project. In the SQL editor, or with `npx supabase link` then `npx supabase db push`, apply everything in `supabase/migrations`.
2. **Auth URLs:** Supabase → Authentication → URL Configuration: set Site URL to your domain and add `https://<your-domain>/**` to Redirect URLs.
3. **Google sign-in:** Google Cloud Console → APIs & Services → Credentials → Create OAuth client (Web). Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`. Paste the client ID and secret into Supabase → Authentication → Providers → Google.
4. **Sign-in email:** Supabase's built-in email sender only allows a few messages an hour. Before real users arrive, set up custom SMTP (any provider, for example Resend or Postmark) in Supabase → Authentication → Emails → SMTP Settings.
5. **Stripe** (start in Test mode):
   - Products → add **Pro** with two recurring prices (for example $12/month and $96/year). Copy the price ids into `STRIPE_PRICE_PRO_MONTHLY` and `STRIPE_PRICE_PRO_YEARLY`.
   - Developers → API keys → secret key into `STRIPE_SECRET_KEY`.
   - Developers → Webhooks → add endpoint `https://<your-domain>/api/stripe/webhook` with the events `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated` and `customer.subscription.deleted`. Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
   - Settings → Billing → Customer portal: turn it on, and allow cancelling and switching between the two Pro prices.
   - Locally: `stripe listen --forward-to localhost:3000/api/stripe/webhook` prints a `whsec_…` secret for `.env.local`. Test card: 4242 4242 4242 4242, any future date, any CVC.
6. **Vercel:** import the repo and add every variable from `.env.example` (Production and Preview):
   - `NEXT_PUBLIC_APP_URL` is optional on Vercel: it falls back to the project's production domain. Set it when you add a custom domain.
   - Set `NEXT_PUBLIC_CONTACT_EMAIL`. Production builds refuse to build without it, so no placeholder address ships.
   - Leave `AI_PROVIDER` as `anthropic`.
   - Deploy.
7. **Check it:** sign up with a real email, add a resume, compare a job, write and download a resume, then upgrade with Stripe's test card and open Manage billing.

### Analytics (optional)

Set `NEXT_PUBLIC_ANALYTICS_DOMAIN` to turn on cookie-free page analytics (Plausible, or a compatible service via `NEXT_PUBLIC_ANALYTICS_SRC`). Only page views and a few named events are counted: resume imported, application created, resume written, resume downloaded, upgrade started. No resume, vault or posting content is ever sent.

Milestone status and anything still missing are tracked in `PLAN.md`.
