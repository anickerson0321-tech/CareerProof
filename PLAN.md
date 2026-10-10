# CareerProof: build plan

Status: **Plan written. Waiting for "go" before Milestone 1.**

This file is kept up to date as the build goes. `SPEC.md` is the source of truth for product behavior. Where this plan differs from the spec, the difference is listed under [Spec issues and decisions](#3-spec-issues-and-decisions) and needs your OK.

---

## 0. Versions (checked 2026-10-10)

| Package | Version | Notes |
|---|---|---|
| Node | 22 LTS | Vercel default |
| next | 16.x | App Router. In Next 16, `middleware.ts` is now `proxy.ts` and `next lint` is gone, so lint runs the ESLint CLI directly. |
| react / react-dom | 19.x | |
| typescript | 5.x | `strict`, `noUncheckedIndexedAccess` |
| tailwindcss | 4.x | CSS-first config (`@theme`), used with shadcn/ui |
| @supabase/supabase-js, @supabase/ssr | 2.x, 0.12.x | Cookie-based SSR auth |
| supabase (CLI, dev dependency) | 2.x | Local stack, migrations, type generation |
| @anthropic-ai/sdk | 0.133.x | Structured outputs through `messages.parse` + `zodOutputFormat` |
| zod | 4.x | The SDK's zod helper accepts zod 3.25+ or 4 |
| stripe | 23.x | |
| docx | 9.x | |
| @react-pdf/renderer | 4.x | |
| unpdf, mammoth | 1.8.x, 1.13.x | |
| pdf-lib | 1.x | Counts pages in the generated PDF |
| vitest | 5.x | |
| @playwright/test | 1.64.x | Uses the preinstalled Chromium |

---

## 1. File structure

```
CareerProof/
├─ SPEC.md, PLAN.md, README.md, .env.example
├─ next.config.ts              # outputFileTracingIncludes for fonts; server-only packages
├─ proxy.ts                    # Supabase session refresh + route protection (Next 16 "middleware")
├─ eslint.config.mjs, vitest.config.ts, playwright.config.ts, tsconfig.json
├─ components.json             # shadcn config
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/
│  │  ├─ 0001_core.sql         # tables, enums, FKs, indexes, updated_at triggers
│  │  ├─ 0002_codes.sql        # per-user code counters + next_code() functions
│  │  ├─ 0003_rls.sql          # RLS enable + policies on every table
│  │  ├─ 0004_storage.sql      # private "resumes" bucket + path-scoped policies
│  │  └─ 0005_billing.sql      # stripe_events, subscription fields
│  └─ seed.sql                 # local-only seed (none in production)
├─ app/
│  ├─ layout.tsx, globals.css  # fonts (next/font), tokens, dark mode
│  ├─ (marketing)/             # page.tsx (landing), privacy/, terms/, contact/
│  ├─ demo/                    # read-only demo: vault + application workspace from lib/demo
│  ├─ (auth)/login/, auth/callback/route.ts, auth/confirm/route.ts
│  ├─ (app)/                   # signed-in shell
│  │  ├─ onboarding/           # add your resume
│  │  ├─ vault/
│  │  ├─ applications/         # list, new/, [id]/ (Match · Resume · Cover letter · Posting)
│  │  └─ settings/             # profile, billing, data export, delete account
│  ├─ opengraph-image.tsx
│  └─ api/                     # route handlers listed in SPEC §6
│     ├─ resume/extract-text/route.ts
│     ├─ vault/import/route.ts, vault/confirm-all/route.ts
│     ├─ vault/facts/route.ts, vault/facts/[id]/route.ts
│     ├─ vault/jobs/route.ts, vault/jobs/[id]/route.ts
│     ├─ applications/route.ts, applications/[id]/route.ts
│     ├─ applications/[id]/answer/route.ts, .../gap/route.ts
│     ├─ applications/[id]/resume/route.ts, .../cover-letter/route.ts
│     ├─ documents/[id]/route.ts, documents/[id]/export/route.ts
│     ├─ stripe/checkout/route.ts, stripe/portal/route.ts, stripe/webhook/route.ts
│     └─ account/export/route.ts, account/route.ts (DELETE)
├─ components/
│  ├─ ui/                      # shadcn primitives
│  ├─ vault/                   # FactRow, JobCard, ConfirmBanner, AddFactForm, InlineConfirm…
│  ├─ match/                   # ScoreCard, SegmentBar, RequirementCard, FactChip, QuestionCard
│  ├─ resume/                  # ResumePreview, BulletRow, GuardBadge, ExportBar, PageTargetPicker
│  ├─ letter/                  # LetterEditor
│  └─ common/                  # ProgressState (timing text + cancel + live region), ErrorNotice, UpgradePrompt, StatusPill
├─ lib/
│  ├─ env.ts                   # zod-validated env; server vs public split
│  ├─ supabase/                # server.ts, browser.ts, admin.ts (service role, server-only)
│  ├─ auth/require-user.ts     # auth + ownership helpers used by every route
│  ├─ api/                     # handler wrapper: zod input, error → plain-language JSON
│  ├─ dates/                   # parse.ts, intervals.ts (mergedMonths), format.ts ("10 yrs 7 mos")
│  ├─ vault/                   # normalize.ts, merge.ts (re-import dedupe), codes.ts, summary-claims.ts
│  ├─ matching/                # status.ts (derived status), score.ts, questions.ts
│  ├─ guard/                   # truth-guard.ts, numbers.ts, authority.ts (shared client + server)
│  ├─ render/                  # model.ts, layout.ts, docx.ts, pdf.tsx, fit.ts, cuts.ts, letter-*.ts, fonts/
│  ├─ extract/                 # docx.ts, pdf.ts, txt.ts, detect.ts (scanned/.doc/garbled)
│  ├─ ai/
│  │  ├─ provider.ts           # provider-neutral interface
│  │  ├─ anthropic.ts          # Anthropic implementation (server-only)
│  │  ├─ mock.ts               # fixture-backed provider for tests/E2E
│  │  ├─ log.ts                # ai_calls logging (metadata only) + cost
│  │  ├─ limits.ts             # rate limit + monthly cost cap
│  │  └─ tasks/                # extract-resume.ts, analyze-posting.ts, answer-to-fact.ts,
│  │                           # generate-resume.ts, fact-check.ts, cover-letter.ts
│  ├─ billing/                 # plans.ts (limits), stripe.ts, webhook.ts
│  ├─ demo/                    # Jordan Rivera sample data (static, typed like real data)
│  └─ analytics.ts             # optional, privacy-friendly (no cookies, no PII)
└─ tests/
   ├─ unit/                    # vitest
   ├─ fixtures/
   │  ├─ resumes/              # custodial-lead, career-changer, new-grad, skills-table, scanned-pdf (+ .docx/.pdf versions)
   │  ├─ postings/             # 3 postings
   │  └─ ai/                   # recorded AI responses keyed by task + fixture
   ├─ rls/                     # user A vs user B against local Supabase
   ├─ live/                    # opt-in `npm run test:live` (real API)
   └─ e2e/                     # playwright, desktop + mobile (375×812) projects
```

Scripts: `dev`, `build`, `typecheck` (`tsc --noEmit`), `lint` (`eslint .`), `test` (vitest unit + fixtures), `test:rls`, `test:live`, `test:e2e`, `db:types` (generate `lib/supabase/types.ts`).

---

## 2. Database schema

Every table has `id uuid primary key default gen_random_uuid()` (except `profiles` and join tables), `user_id uuid not null references auth.users on delete cascade`, `created_at timestamptz default now()`, `updated_at timestamptz default now()` (trigger-maintained). RLS is on for every table, with `select/insert/update/delete using (user_id = auth.uid()) with check (user_id = auth.uid())`. Child tables also have a composite FK, or a check in policy, so a row can't point at another user's parent.

### Enums
- `fact_type`: duty, accomplishment, skill, education, certification, training, summary_claim, answer, other
- `fact_origin`: resume, answer, manual
- `fact_status`: confirmed, pending, unsupported
- `job_status`: confirmed, pending
- `app_status`: draft, applied, interviewing, offer, closed
- `req_kind`: required, preferred · `req_logic`: all, any · `ai_status`: strong, partial, hidden, unknown
- `doc_kind`: resume, cover_letter · `page_target`: strict_one, one_if_possible, up_to_two
- `plan`: free, pro

### Tables
| Table | Columns (beyond id/user_id/timestamps) |
|---|---|
| `profiles` | user_id PK, full_name, email, phone, location, headline, plan (default free), stripe_customer_id, stripe_subscription_id*, subscription_status*, current_period_end*, next_fact_no* int, next_job_no* int, imports_used* int |
| `source_documents` | storage_path (`{user_id}/{uuid}-{filename}`), filename, mime_type, size_bytes*, extracted_text, extraction_warnings jsonb |
| `jobs` | code (j1…), employer, title, location, start_date text, end_date text, dates_uncertain bool, status, source_document_id FK null, unique(user_id, code) |
| `facts` | code (E1…), type, job_id FK null (on delete set null), text, normalized_text* (for dedupe), source_passage, source_document_id FK null, origin, explicit bool, note, status, extraction_confidence numeric null, confirmed_at, answered_requirement_id FK null, unique(user_id, code) |
| `fact_revisions` | fact_id FK cascade, previous_text, new_text |
| `applications` | title, employer, posting_text, posting_url, ignored_note, status |
| `requirements` | application_id FK cascade, code (R1…), text, kind, logic, parts text[], ai_status, explanation, question, years_required numeric, relevant_job_ids uuid[], user_gap bool, answered bool, position int |
| `requirement_evidence` | PK(requirement_id, fact_id), user_id; both FKs cascade |
| `documents` | application_id FK cascade, kind, version int, page_target, content jsonb, unique(application_id, kind, version) |
| `ai_calls` | task, model, input_tokens, output_tokens, cost_usd*, latency_ms, success, error_code. **No prompt or response content, ever.** |
| `stripe_events`* | id (Stripe event id) PK, type, processed_at. RLS on with **no** policies (service role only). Used to make webhooks idempotent. |

`*` = not in the spec, added. Reasons are in §3.

Codes: `next_code(user_id, 'fact'|'job')` is a SQL function that increments the counter on `profiles` atomically. **Codes are never reused**, so an old document that cites E7 can never quietly point at a different fact.

`documents.content` (resume) is zod-typed in `lib/render/model.ts`:
`{ summary: {text, fact_ids, reviewed, ai_check}, jobs: [{job_id, bullets: [{id, text, fact_ids, requirement_codes, relevance, included, reviewed, ai_check: {ok, issue} | null}]}], skills: [{text, fact_ids, included}] }`. Titles, employers, dates, education and certifications are **not** stored in the document. They're read from the vault when rendering.

---

## 3. Spec issues and decisions

Items marked **(needs your OK)** change or interpret the spec. The rest are clarifications I'll go ahead with unless you say otherwise.

### AI / Anthropic
1. **Forcing JSON through tool use doesn't work on `claude-sonnet-5-5`.** Forced `tool_choice` (`any`/`tool`) returns a 400 on that model. I'll use the SDK's structured outputs instead (`client.messages.parse` with `output_config.format = zodOutputFormat(schema)`). That constrains decoding to the schema, and then Zod validates the result again in code. This is what §2 asks for ("force JSON that matches a schema"), done the way the current API supports.
2. **The fact-check schema `[{i, ok, issue}]` is a bare array.** Structured outputs need an object at the root, so I'll use `{ checks: [{i, ok, issue}] }`.
3. **Refusals.** Every call checks `stop_reason === "refusal"` and `max_tokens` before reading content. Both become a clear, user-facing error that counts as a failed `ai_calls` row. I'll also turn on Anthropic's server-side `fallbacks: "default"` for Sonnet calls, so a false-positive safety refusal is retried on another Claude model instead of failing the user. **(needs your OK, since it means another Claude model may process that one request)**
4. **The answer re-judge may return `gap`, but rule 4 says the AI never declares a gap.** I'll map it like this: `has=false` sets `user_gap` because the *user* said they lack it, which is allowed. A `gap` status while `has=true` becomes `partial`.
5. **Cancel.** The browser aborts the request and the route passes `request.signal` to the SDK. Vault writes happen only after the AI result validates, so a cancelled import saves nothing.
6. **Long calls on Vercel.** AI routes set `export const maxDuration = 120` (Fluid compute allows it). Resume extraction streams progress events so the UI can show real stages.

### Data and truth rules
7. **Remove must not let a re-import bring the fact back.** If Remove hard-deletes, the next import of the same resume adds the fact again. Instead, Remove sets `status = 'unsupported'`: the fact is hidden, can never be cited, and stays as a marker so dedupe skips it. That gives the spec's unused `unsupported` value a job. Account deletion removes these rows too. **(needs your OK)**
8. **Jobs have a `pending`/`confirmed` status but no screen to confirm them.** I'll add a Confirm button on each job card. "Confirm all" covers jobs too, and editing a job confirms it, like facts.
9. **Partial support from facts the user hasn't confirmed yet.** The status pseudo-code downgrades to "Needs your OK" only for `strong`. A `partial` that rests entirely on unconfirmed facts would show as "Partly supported", which overstates the record. I'd add: `ai_status == partial` and no cited fact confirmed → `hidden`. **(needs your OK, small change to §5)**
10. **Year-only dates in years-of-experience math.** I'll count conservatively: a year-only start counts from December of that year and a year-only end from January, so we never overstate. The UI says "at least 7 yrs 2 mos" and shows the "dates unclear" flag. `present` means the current month. Invalid dates are left out of the total, and the job is flagged.
11. **Rule 9 discrepancy check.** Code parses `summary_claim` facts for "N+ years" / "N years" and compares them with merged months. A disagreement shows in the vault and on the Match tab, and the resume prompt is told not to repeat the claim.
12. **Cover letters have no citations, so Truth Guard can't gate them.** I'll run the number check on the letter (numbers that don't appear in the facts sent to it) and show non-blocking "Check this" notes. Export isn't blocked, since letters aren't line-cited. **(needs your OK)**
13. **Skills, education and certifications on the resume.** AI-chosen skills must cite confirmed `skill` facts (hard rule only). Education and certifications are printed straight from confirmed vault facts, never from AI text.
14. **Summary rule.** A failing summary is left out of export with a visible note (§8). The same `reviewed` override applies.
15. **Contact info on documents comes from Settings → Profile**, which is pre-filled from the resume import. It's never AI text at render time.

### Export
16. **We can't directly measure DOCX page count on the server.** Word does its own layout, and there's no reliable server-side Word renderer on Vercel. My approach:
    - Both renderers share one layout spec (font metrics, sizes, margins, spacing) in `lib/render/layout.ts`.
    - PDF page count is measured with pdf-lib on the actual output, as the spec requires.
    - The fit check uses a small safety margin (it targets ~97% of the usable page height), so DOCX, which is laid out with the same numbers, doesn't spill over.
    - In tests (CI and locally), the DOCX is converted with LibreOffice (`soffice --headless`, available here) and its pages are counted. That backs the "exactly one page in both formats" acceptance check. In production, the PDF measurement plus the margin is the guarantee.
17. **Fonts.** The PDF embeds Liberation Sans (OFL licence, same metrics as Arial). The DOCX names Arial, which every Word install has, and the metrics match. Arial itself isn't redistributable, so it isn't bundled.

### Billing and limits
18. **Can free users write cover letters?** The spec lists cover letters under Pro. My default is to follow that: free users see an upgrade prompt on the Cover letter tab. **(needs your OK, or say "free gets cover letters")**
19. **What counts as "1 resume import" on free?** The first import is free. "Add another resume" shows the upgrade prompt. Pasting text counts as an import.
20. **Fields the spec doesn't have.** Added `stripe_subscription_id`, `subscription_status`, `current_period_end` on profiles, and `stripe_events` for idempotent webhooks. `stripe_events` isn't user-owned, so it has RLS on with no policies (service role only). That's the one exception to "every table is owned by user_id".
21. **Rate limiting.** Vercel functions keep no memory between requests, so an in-memory limiter won't work. I'll count recent `ai_calls` rows per user in Postgres instead (for example ≤ 10 AI calls per minute and ≤ 200 per day), so there's no Redis to run. The cost cap sums `cost_usd` for the calendar month against `AI_MONTHLY_COST_CAP_USD`. Prices live in code: Sonnet 5.5 $2/$10, Haiku 5.5 $0.10/$0.50 per million tokens.
22. **Account deletion also cancels any active Stripe subscription** before deleting the auth user. Rows cascade, and storage files under `{user_id}/` are removed through the Storage API.

### Scope and setup
23. **The posting URL field** ("later milestone") has no milestone. For v1 I'll store `posting_url` as a reference only and not fetch it, which also avoids server-side request forgery (SSRF) risk. I can add fetching after M8 if you want it.
24. **Extra env vars:** `NEXT_PUBLIC_CONTACT_EMAIL` (Contact page), `NEXT_PUBLIC_ANALYTICS_DOMAIN` (optional, Plausible-style, no cookies), `AI_PROVIDER=anthropic|mock` (mock for E2E), `SUPABASE_DB_URL` (local RLS tests only).
25. **E2E auth.** Magic links are produced with the Supabase admin `generateLink` against the local stack. No real email is sent. Google OAuth can't be automated, so I'll test it by hand once you've set it up.
26. **Stripe acceptance (M7)** needs your test-mode keys plus the Stripe CLI to forward webhooks. Until then, the webhook handler is unit-tested with signed test payloads (`stripe.webhooks.generateTestHeaderString`).
27. **`extraction_confidence`** isn't in the extraction schema, so it stays null for now and is never used as status. I'll leave the column in so the AI can fill it later.
28. **Supabase local stack.** The local stack needs Docker for RLS tests and E2E. If Docker isn't available in a given environment, RLS tests skip with a clear message and don't pass silently.

---

## 4. Milestones

Each milestone ends with `npm run typecheck && npm run lint && npm test`, fixes, a commit, a PLAN.md update, and a short summary with anything you need to do.

### M1: Foundation
- Next 16 app, TS strict, Tailwind 4 + shadcn, ESLint flat config, Vitest, Playwright.
- Design tokens (light/dark, teal/amber/blue/grey/brick status colors, AA-checked), fonts: Bricolage Grotesque / Public Sans / JetBrains Mono.
- Supabase clients, `proxy.ts`, magic link + Google sign-in, callback, profile row created on first sign-in.
- Migrations 0001–0005 with RLS, storage bucket, code counters. RLS test: user A can't read or write user B's rows.
- Landing page (all sections), Privacy/Terms/Contact with real content.
- `/demo` with the Jordan Rivera data, showing every status type, two questions, and the flagged "Managed LMS…" bullet (static and read-only, no AI).
- Date utilities + derived status + Truth Guard as pure modules with unit tests, since the demo needs them.
- ✅ A new user can sign up and land on onboarding. The demo shows every status type.

### M2: Resume import + Vault
- Upload/paste, 5 MB / 60k-char limits, extraction (mammoth / unpdf / txt), detection of scanned PDFs, `.doc` files and garbled text.
- AI provider interface, Anthropic + mock implementations, `extract-resume` task, ai_calls logging, rate limit and cost cap.
- Merge/dedupe on re-import, pending inserts, jobs sorted by end date.
- Vault screen: stats, confirm banner/all, job edit/confirm, fact edit (with revisions) / remove (inline two-step) / add, sections, re-import "what's new".
- The 5 resume fixtures and their recorded AI outputs.
- ✅ All 5 fixtures import correctly. Confirmations survive a reload.

### M3: Job analysis + Match + Questions
- `analyze-posting` task + code post-processing (drop foreign codes, drop questions on strong items, cap at 4, required first).
- Match tab: score card, segment bar, legend, ignored note, requirement cards, years math text, fact chips, confirm-from-match, questions, `answer-to-fact` (Haiku), "I don't have this" + Undo.
- The 3 posting fixtures.
- ✅ Boilerplate never becomes a requirement. No question repeats what the vault already says. Answers persist and are reused by a second application.

### M4: Resume Studio + Truth Guard
- `generate-resume` + `fact-check` tasks. Document versions. PATCH for edits, include and reviewed (edits clear `reviewed`/`ai_check` and re-run the code guard).
- Resume tab: page target, preview, bullet rows, badges, banner, Rewrite.
- ✅ Every bullet cites confirmed facts. The demo's inflated bullet is flagged.

### M5: Export + Cover letter
- Shared layout spec, DOCX + PDF renderers, fit ladder, pdf-lib page count, cut suggestions with one-tap removal, server-side guard in export.
- Cover letter: streamed generation, autosaving editor, word count, copy, DOCX/PDF.
- ✅ A strict one-page resume exports as exactly one page in both formats (DOCX checked through LibreOffice in tests). A line that can't be exported can't be forced through the API (API test).

### M6: Applications tracker + Account
- Applications list, status dropdown, unconfirmed warning, empty state.
- Settings: profile, data export JSON, delete account (typed confirmation, rows + files + Stripe).
- ✅ Deletion removes all rows and files (test checks every table and the bucket).

### M7: Billing
- Plans and limits, upgrade prompts, Checkout, Portal, webhook (signature-verified, idempotent), usage this month.
- ✅ A free user hits the limit, upgrades in Stripe test mode, and gets Pro right away. Needs your test keys.

### M8: Polish + release
- Accessibility pass (axe in Playwright), mobile pass, empty/loading/error states, SEO metadata, OG image, analytics hook, README with setup + deploy, `.env.example`.
- Full Playwright flow from SPEC §14 on desktop and 375×812.
- ✅ The suite passes on both viewports, and the README deploy steps work from a fresh clone.

---

## 5. What I'll need from you (no rush, mocks cover it until then)

| When | What | Where to get it | Env var |
|---|---|---|---|
| M1 (to run against cloud) | Supabase project | supabase.com → New project → Settings → API | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| M1 | Google OAuth client | Google Cloud Console → Credentials → OAuth client (Web), redirect `https://<project>.supabase.co/auth/v1/callback`; paste into Supabase → Auth → Providers → Google | (set in the Supabase dashboard) |
| M2 | Anthropic API key | console.anthropic.com → API Keys | `ANTHROPIC_API_KEY` |
| M7 | Stripe test keys + 2 prices | dashboard.stripe.com (Test mode) → Developers → API keys; Products → Pro, monthly + yearly prices | `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_YEARLY`, `STRIPE_WEBHOOK_SECRET` (from `stripe listen` or the webhook endpoint) |
| M8 | Contact email, analytics domain (optional) | You | `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_ANALYTICS_DOMAIN` |

---

## 6. Progress log

- 2026-10-10: Plan written. SPEC.md added to the repo. Waiting for "go".
