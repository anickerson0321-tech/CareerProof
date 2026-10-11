# CareerProof: build plan

Status: **All 8 milestones done.** The build is complete and tested locally. Going live needs your accounts and keys (§5); the steps are in the README.

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
| pdf-lib + @pdf-lib/fontkit | 1.17 / 1.1 | Replaces @react-pdf/renderer; see M5 notes |
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
│  │  ├─ …01_core.sql          # tables, enums, FKs, indexes, updated_at triggers
│  │  ├─ …02_codes_profiles.sql # per-user codes, confirmed_at, signup → profile
│  │  ├─ …03_rls.sql           # RLS + grants on every table
│  │  ├─ …04_storage.sql       # private "resumes" bucket + folder policies
│  │  └─ …05_billing.sql       # stripe_events
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
| `profiles` | user_id PK, full_name, email, phone, location, headline, plan (default free), stripe_customer_id, stripe_subscription_id*, subscription_status*, current_period_end*, next_fact_no* int, next_job_no* int, imports_used* int, applications_created* int (counts ever created, so delete-and-recreate doesn't reset the free limit) |
| `source_documents` | storage_path (`{user_id}/{uuid}-{filename}`), filename, mime_type, size_bytes*, extracted_text, extraction_warnings jsonb |
| `jobs` | code (j1…), employer, title, location, start_date text, end_date text, dates_uncertain bool, status, source_document_id FK null, unique(user_id, code) |
| `facts` | code (E1…), type, job_id FK null (on delete set null), text, normalized_text* (for dedupe), source_passage, source_document_id FK null, origin, explicit bool, note, status, extraction_confidence numeric null, confirmed_at, answered_requirement_id FK null, unique(user_id, code) |
| `fact_revisions` | fact_id FK cascade, previous_text, new_text |
| `applications` | title, employer, posting_text, posting_url, ignored_note, status |
| `requirements` | application_id FK cascade, code (R1…), text, kind, logic, parts text[], ai_status, explanation, question, years_required numeric, relevant_job_ids uuid[], user_gap bool, answered bool, position int |
| `requirement_evidence` | PK(requirement_id, fact_id), user_id; both FKs cascade |
| `documents` | application_id FK cascade, kind, version int, page_target, content jsonb, unique(application_id, kind, version) |
| `ai_calls` | task, model, input_tokens, output_tokens, cost_usd*, latency_ms, success, error_code. **No prompt or response content, ever.** Users can read their own rows only; writes are service-role. |
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

- 2026-10-10: Plan written. SPEC.md added to the repo.
- 2026-10-10: "go" received with no answers to the five open items, so the defaults in §3 apply: Remove = tombstone (3.7); partial needs a confirmed fact (3.9); letter number check is non-blocking (3.12); server-side refusal fallback on (3.3); cover letters are Pro only (3.18).
- 2026-10-10: **M1 done.** Details in §7.
- 2026-10-11: You asked me to keep going through all milestones without stopping. **M2 done.**
- 2026-10-11: **M3, M4, M5, M6 and M7 done.** M7's live Stripe check needs your test keys (§5).
- 2026-10-11: **M8 done. All milestones complete.**
- 2026-10-11: Independent security and correctness reviews; 18 confirmed issues fixed (§7, Hardening).

## 7. Milestone notes

### M1: Foundation (done)

What works:
- Next 16.4 app (Turbopack, Cache Components, Partial Prefetching), TS strict + `noUncheckedIndexedAccess`, Tailwind 4, ESLint 9 flat config, Vitest, Playwright (desktop + 375×812).
- Design tokens for light and dark (system preference plus a toggle, no flash), status colors, Bricolage Grotesque / Public Sans / JetBrains Mono via `next/font`, skip link, visible focus, reduced motion.
- Supabase auth: magic link (PKCE) and Google button, `/auth/callback`, `/auth/signout`, `/start` routing (onboarding until the vault has facts), and `proxy.ts` for session refresh and route protection. A profile row is created on signup by a DB trigger.
- Migrations: all tables, enums, composite same-user foreign keys, never-reused per-user codes (E1/j1) assigned by triggers, `confirmed_at` stamping, RLS on every table, column-level grants (users can't change plan, billing, counters or AI usage rows), private `resumes` bucket with folder-scoped policies, `stripe_events`.
- RLS test suite (18 tests): user A/B isolation on every table and storage, anon sees nothing, cross-user foreign keys rejected, privileged columns locked, codes immutable, and auth-user deletion cascades everything. It passes on plain Postgres 16 (with a small Supabase shim) and on the Supabase Postgres 17 stack.
- Pure logic with unit tests (65 tests): date parsing, merged months (overlaps, present, year-only, invalid), derived status, Truth Guard (numbers, %, commas, authority words, unconfirmed, removed and foreign citations, reviewed override, edit reset), summary-claim checks (rule 9), demo invariants.
- Landing page (hero, how it works, example match cards, trust line, pricing, FAQ, footer), Privacy, Terms and Contact with real content (lawyer-review note in code comments only).
- `/demo` and `/demo/application`: Jordan Rivera's vault and the Mercy Valley Health application, with statuses computed by the real code: every status type, two questions, the years calculation ("10 yrs 7 mos … This asks for 3."), "Confirm E12", Undo on the gap, the resume preview with Truth Guard flagging "Managed LMS training compliance…", the cover letter and the posting. Read-only, no AI calls.
- E2E (12 tests across desktop and mobile): landing content, demo statuses and flagged bullet, real magic-link signup through local Mailpit → onboarding, signed-in redirect away from /login, sign-out, protected-route redirect, and an expired-link message.
- CI workflow: typecheck, lint, unit tests, RLS tests (Postgres service).

Deviations and notes:
- **shadcn CLI registry is blocked** from this build environment, so the shadcn-style primitives (Button, Card, Input/Textarea/Label, Tabs, Checkbox) were written by hand on `radix-ui`, in shadcn's structure. `components.json` is present so `npx shadcn add …` works on a normal machine.
- **Cache Components:** auth reads call `connection()` first (Supabase's session code reads the clock, which isn't allowed during prerender or prefetch). Layouts never await auth; session-dependent UI sits inside `<Suspense>`.
- **Onboarding in M1** is the welcome screen and explanation. The upload/paste form and "Read my resume" are M2 scope and land on the same page.
- **Contact email:** Privacy, Terms and Contact refuse to build in production without `NEXT_PUBLIC_CONTACT_EMAIL`, so a placeholder address can't ship.
- **Database types** are generated from the local stack (`npm run db:types`).

### M2: Resume import + Vault (done)

What works:
- Upload (.docx, .pdf, .txt, max 5 MB) or paste (max 60k characters). Files are identified by their content, not their name. The original goes to the private bucket under `<user_id>/` and the extracted text plus warnings go to `source_documents`. The person sees exactly what was read before anything is sent to the AI.
- Explicit problem detection with what-to-do messages: scanned or image-only PDF (blocking), old .doc (blocking, with Save As instructions), unsupported types (blocking), scrambled text (warning, or blocking when severe), too short, too long, empty.
- AI layer: `lib/ai/provider.ts` interface, Anthropic implementation (structured outputs + Zod, refusal and truncation handling, server-side refusal fallback on the main model), and a mock provider that replays recorded fixtures. `lib/ai/run.ts` checks per-user rate limits (10/min, 200/day) and the monthly cost cap, retries once on unusable output, and logs metadata-only `ai_calls` rows with cost.
- `extract-resume` task: prompt with every SPEC 7.1 rule, schema, and code post-processing (contact info never becomes a fact, unknown job keys dropped, invalid dates dropped and flagged, sources trimmed to 25 words, jobs sorted newest first).
- Merge on re-import: jobs are matched by employer + title (ignoring case, punctuation, "Inc"/"LLC"), and facts by normalized text. Nothing already in the vault is duplicated or overwritten, removed facts never come back, and profile fields are only filled when empty. The insert is one transaction in the `import_vault_items` database function, which runs as the user so the access rules still apply.
- Vault screen:
  - Stats, the "Check these over, then confirm" banner with Confirm all, and work history with durations and "Dates unclear" flags.
  - Sections for Skills, Education, Certifications, Training, From your answers, Summary claims (with the rule 9 years check) and Other.
  - Per fact: Confirm, Edit (stores a revision and confirms), and Remove (inline two-step).
  - Edit job details (with date validation; saving confirms the job), and "+ Add a fact yourself" (saved as confirmed, origin manual).
  - Import summary: "Added N new facts and M new jobs", how many were already there, and "New" badges when adding to an existing vault.
- Free plan: 1 import, enforced on the server (`record_import`, a service-role-only counter); the UI shows an upgrade prompt instead of a dead end.
- Fixtures: 5 resumes (custodial lead, career changer, new grad, skills table, scanned/OCR text) plus binary .docx/.pdf/scanned PDF/.doc files, and recorded extraction responses for each.
- Tests: 120 unit tests (all 5 fixtures import correctly: jobs, dates, education status, skills separate from duties, no contact info; merge/dedupe; extraction and detection), 18 RLS, and 16 E2E across desktop and mobile. The E2E covers upload → read → confirm all → reload, edit, remove, add, editing job dates, the free-plan limit, a Pro re-import with no duplicates and no resurrected fact, and the bad-file messages. `npm run test:live` is opt-in and skips without a key.

Notes:
- **The recorded AI responses were written by hand to the extraction rules**, because this build environment has no Anthropic API key for the project. `npm run test:live` checks the real model against the same rules once `ANTHROPIC_API_KEY` is set. Re-record fixtures from live output if the model's wording differs.
- `/upgrade` (linked from upgrade prompts) is built in M7.
- Until M3 adds the applications list, signed-in users with a vault land on `/vault`.

### M3: Job analysis + Match + Questions (done)

What works:
- `analyze-posting` task. The prompt carries every SPEC 7.2 rule. The vault is sent with durations computed in code and confirmed/unconfirmed labels.
- Code post-processing of the analysis:
  - Drops citations to codes that don't exist or aren't this person's, and duplicate citations.
  - Drops boilerplate requirements with a regex backstop, plus duplicate requirements, and caps at 12.
  - Orders required items first and assigns R1… codes.
  - Keeps "any"/"all" logic only when there are parts.
  - Removes questions where the derived status is already strong, and caps questions at 4, required first.
- `create_application` database function: the application, requirements and evidence are saved in one transaction under RLS. The free plan's 2-application limit is counted as "ever created" (`record_application`, service role only).
- Match tab:
  - Score card with a segment per requirement and a legend, plus the "Left out of matching" note.
  - Requirement cards with status pill, explanation, the years calculation from merged dates, "Any one of these counts" for or-logic, and fact chips that expand to show the fact and whether it's confirmed.
  - "Confirm E3" / "Confirm <job>" when unconfirmed items are all that's holding a requirement back.
  - "You don't have this" with Undo.
- Questions: Save answer → `answer-to-fact` on the fast model. Code refuses statements that add numbers or authority words the answer didn't contain, falling back to the person's own words. The answer is saved to the vault as an unconfirmed `answer` fact linked to the requirement, and the requirement is re-judged. "Added to your vault as E26: …" stays with Looks right / Edit in vault until confirmed, so it survives reloads. "I don't have this" (or an answer that says so) marks a user gap.
- Answers are reused automatically: they're vault facts, so the next analysis sees them. The second-application fixture cites E26 and doesn't ask again.
- Applications list: title, employer, date, "X of Y required met" (computed live from today's vault), a small segment bar, status dropdown, empty state, and the unconfirmed-vault warning. Home after onboarding is `/applications`.
- New application: paste the posting, with an optional link that's saved for reference and never fetched. Progress with Cancel; free-plan limit prompt; a nudge when the vault is empty.
- Fixtures: 3 postings (EVS supervisor, instructional designer, junior developer); 4 recorded analyses, including Denise's vault before and after answering; 1 recorded answer.
- Tests: 153 unit tests and 18 E2E across desktop and mobile. Unit tests check, for every fixture: no boilerplate requirement, 6–12 requirements, only own citations, ≤4 questions with required first, none on supported items, years math, the question cap, the answer cleanup guards, and the "second application reuses the answer" case. The E2E runs the whole Match flow, including reload persistence and the second application.

### M4: Resume Studio + Truth Guard (done)

What works:
- The `generate-resume` task is sent requirements with their code-derived statuses, **confirmed facts only**, the confirmed jobs (code, title, employer, dates, for grouping only), the length guide for the page target, and a code-computed check of each summary claim against the dates. That check tells the AI not to restate claims the dates don't support.
- Code post-processing of the generated resume:
  - Citations must be confirmed facts that belong to the person. Others are dropped, and a line left with no citation stays visible but blocked.
  - Bullets must sit under a confirmed job.
  - Requirement codes must exist and relevance is clamped to 1–3.
  - Bullets are ordered most relevant first, in the vault's job order.
  - Skills must cite a skill fact, up to 10.
  - Titles, employers and dates are never taken from the AI.
- The `fact-check` task is a separate pass over every line and the facts it cites, and its verdicts become soft flags. If the pass itself fails, the lines stay unchecked and the code checks still apply. The schema is wrapped as `{checks: [...]}` (PLAN §3.2).
- Every version is saved: Rewrite creates version N+1 and the UI shows the latest.
- `PATCH /api/documents/:id` applies one operation: edit, include, review, summary edit or review, skill include, exclude-many (for page-fit cuts), or page target. The same `applyOp` runs in the browser (instant) and on the server (the source of truth).
  - Editing clears `reviewed` and the AI check.
  - "It's accurate" is refused on the server for any line with a hard flag.
- Resume tab:
  - Page target, "Write my resume" (progress with Cancel), and a preview that looks like a real resume (white paper, Arial). Name and contact come from the profile.
  - Experience shows every confirmed job, plus a note when unconfirmed jobs are left out. Skills, education and certifications come from confirmed facts.
  - Each line has an include checkbox, a Truth Guard badge, fact chips, and plain-language flag reasons. Edit happens inline and saves when you click away. "It's accurate" appears on soft flags.
  - A banner says either "Every included line is backed by a confirmed fact" or "N lines need a look…".
- Fixtures: a recorded generation and fact-check for Denise's application after answering a question, including two inflated lines Truth Guard catches ("Trained 12" when the fact says 9, and "Managed supply ordering") and one uncited skill that code drops.
- Tests: 170 unit and 20 E2E across desktop and mobile. The E2E covers write → flags shown → edit fixes one → "It's accurate" on the other → banner clears → exclude a line → reload persists → Rewrite makes version 2 → the vault fact is untouched.

M4 acceptance: every bullet cites confirmed facts (unit test over the generated resume), and the demo's inflated "Managed LMS training compliance…" line is flagged (demo unit test + E2E).

### M5: Export + cover letter (done)

What works:
- One export model (`lib/render/export-model.ts`) feeds both renderers. It is rebuilt on the server from the stored document and the person's current vault on every fit check and download.
  - Only confirmed jobs are included, and only lines that are included and pass Truth Guard.
  - A flagged summary is left out.
  - Skills must cite a fact.
  - Whatever the browser sent, a line that can't be exported never reaches the file.
- Word (`docx`, Arial) and PDF (pdf-lib with embedded Liberation Sans, which has the same metrics as Arial) share one layout spec (`lib/render/layout.ts`): page size, margins, sizes, exact line heights, section rules, date tab stop and bullet indent.
- Fit ladder: 10.5pt/0.75" → 10.5pt/0.6" → 10pt/0.6" → 10pt/0.5". The page count is read from the real PDF.
  - **Strictly one page:** if it still doesn't fit, the download is refused (422 on the API too). The panel lists the lowest-relevance lines that would need to go, found by binary search over the cut order. "Remove these N lines" unchecks them in one tap, and nothing is removed without that tap.
  - **One page if possible:** falls back to two pages, with a note.
  - **Up to two pages:** notes if even that doesn't fit.
- The Download panel under the resume shows "1 page · 10.5pt text, 0.75" margins". It also says how many flagged lines are left out and whether the summary is left out. The layout is re-measured after each change.
- Filenames follow the spec: `Denise Okafor - St. Brigid Medical Center.docx` and `… - Cover Letter.pdf`.
- Cover letter tab (Pro):
  - The letter streams in as plain text, with Cancel. It is written only from confirmed facts behind the strongest matches (up to 4, required first) and saved as a new version.
  - The editor autosaves, shows a word count with a 230–320 guide, and has Copy, Word and PDF.
  - Numbers no confirmed fact states get a non-blocking "Check these numbers" note (§3.12).
  - Free users see the upgrade prompt, and the API returns 402.
- Tests: 190 unit, 18 RLS and 26 E2E across desktop and mobile.
  - Unit: the render tests include **Word/PDF page-count parity at every fit step and for the letter, with the DOCX laid out by LibreOffice**. CI now installs LibreOffice so this runs there too; locally it skips if LibreOffice isn't installed. There are also cover-letter input and number-note tests.
  - E2E: downloads Word and PDF, then checks the page count, the text and that flagged lines are absent. It also tampers with the stored document (marks a flagged line reviewed and points it at a fake fact) and the export still leaves it out, and the API refuses "It's accurate" on it. A padded strict-one-page resume blocks download until the one-tap cut, then exports as exactly one page. The cover letter flow covers the free-plan block, streaming, the edit autosave and number note, reload persistence, and Word and PDF.

Notes:
- **PDF library: pdf-lib instead of @react-pdf/renderer** (SPEC allows a justified alternative). react-pdf's text engine shrinks spaces to fit lines (Knuth-Plass style), so its lines held about 2% more text than Word's. A resume that measured one page as PDF overflowed to two pages in Word at the tighter steps. The pdf-lib renderer breaks lines greedily, the way Word does, with exact line heights. Parity tests now pass at every step. The PDF keeps a 14pt safety margin at the bottom as extra protection.
- The fonts in `lib/render/fonts` (Liberation Sans, SIL OFL 1.1) ship with the export routes via `outputFileTracingIncludes`.
- The recorded cover letter for the test flow was written by hand to the letter rules, like the other fixtures.

### M6: Applications tracker + Account (done)

What works:
- Applications tracker: the list, statuses, the unconfirmed-vault warning and the empty state were built in M3. M6 adds **Settings** to the app navigation.
- Settings (`/settings`):
  - **Your details:** name, email, phone and location printed on documents, validated with plain messages. Blank fields are saved as "not set". The page also shows the email you sign in with.
  - **Plan & usage:** the plan, applications and resume imports used against the free limits, and AI requests this month. Free users get "See Pro plans". The Stripe portal button arrives in M7.
  - **Download my data:** `GET /api/account/export` returns one JSON file with the profile, jobs, facts (including removed ones), fact edit history, the extracted resume text, and every application with its requirements, evidence and document versions, plus AI usage metadata. It is read through RLS as the user, and Stripe ids aren't included.
  - **Delete my account:** you have to type DELETE, and `DELETE /api/account` checks it too.
- Account deletion, in order:
  1. Cancel billing by deleting the Stripe customer, which cancels any subscription. If that fails, **nothing is deleted** and the person is told to try again.
  2. Remove every file under `<user_id>/` in the private bucket.
  3. Delete the auth user, which cascades to every table. The session is then cleared and the person lands on `/account-deleted`.
- Tests: 193 unit, 18 RLS and 30 E2E. The E2E edits details (including a bad email), checks usage, and downloads and inspects the JSON. It then deletes the account and checks that **every table has zero rows for the user, the storage folder is empty, and the auth user is gone (404)**, and that the old session can't reach the app. A second test checks the API refuses deletion without the typed confirmation.

Notes:
- `handle()` now calls `connection()` before running an API route. Every API route is per-request, and this stops the build from trying to prerender GET routes that take no arguments.
- The resume's download bar is now **sticky at the bottom** as SPEC §4.6 asks: page note, Word and PDF. Notes and line-cut suggestions sit just above it in the page.

### M7: Billing (done; the live Stripe run needs your test keys)

What works:
- Plan limits are enforced on the server and explained in the UI. They were built earlier: free gets 1 import and 2 applications (counted as ever created) and no cover letters. Each limit shows an upgrade prompt that links to `/upgrade`. The AI cost cap and rate limits live in `lib/ai/limits.ts` (M2).
- `/upgrade`: Pro features and a monthly/yearly choice, then **Upgrade to Pro** opens Stripe Checkout.
  - Checkout creates the Stripe customer once (idempotency key), passes our user id as `client_reference_id` and as subscription metadata, and allows promotion codes.
  - Cancelling checkout returns to `/upgrade` with "You haven't been charged".
  - If Stripe isn't configured, the page says so instead of showing a broken button.
- `/upgrade/success` confirms the Checkout Session with Stripe directly, so **Pro starts immediately** even if the webhook is slow. The session must belong to the signed-in user.
- `POST /api/stripe/webhook`:
  - The signature is verified against the raw body, and the endpoint answers 400 when it's missing or wrong.
  - Event ids are recorded in `stripe_events`, so retries are no-ops.
  - It handles `checkout.session.completed` and `customer.subscription.created`, `customer.subscription.updated` and `customer.subscription.deleted`.
  - `active`, `trialing` and `past_due` keep Pro, so access continues while Stripe retries a card. `canceled`, `unpaid`, `incomplete`, `incomplete_expired` and `paused` mean Free.
  - A scheduled cancellation shows as "Ends <date>" and keeps Pro until then. The renewal date comes from the subscription items (current Stripe API).
- **Out-of-order deliveries:** a new `profiles.billing_event_at` column records the time of the last applied subscription event. Older events are ignored, so a late "active" can't undo a newer cancellation. Users can't update the column (RLS test).
- Settings → Plan & usage shows Pro or Free, the renewal or end date, a past-due warning, usage, and **Manage billing** (Stripe Customer Portal, which returns to Settings).
- `POST /api/stripe/checkout` and `POST /api/stripe/portal` exist as the spec lists.
- Account deletion (M6) deletes the Stripe customer first, which cancels the subscription.
- Tests: 202 unit, 18 RLS and 32 E2E.
  - Unit: webhook signatures (valid, tampered, wrong secret), event-to-plan mapping, scheduled cancel, past_due, and ignored event types.
  - E2E: a free user with 2 applications is gated (UI and API 402) and sees the upgrade page. A signed `checkout.session.completed` arrives and **Pro is immediate**, so the third application goes through. The test also covers a duplicate delivery, bad and missing signatures, the renewal date and scheduled cancel shown in Settings, a stale event ignored, and the subscription ending with a return to Free while all 3 applications are kept.

Notes:
- **Not yet run against real Stripe.** No Stripe account is connected here. The webhook is exercised with events signed by a local-only secret (set in `playwright.config.ts`). The setup steps are in the README (Stripe step). After you add test keys, the acceptance run is:
  1. Sign up and create 2 applications.
  2. Upgrade with card 4242 4242 4242 4242.
  3. Land on "You have Pro".
  4. Create a third application.
  5. Use Manage billing to cancel.
- Prices shown in the app ($12/month, $96/year) live in `lib/billing/plans.ts`. Stripe charges whatever the price ids say, so keep the two in sync.

### M8: Polish + release (done)

What works:
- **Accessibility:** axe (WCAG 2.1 A and AA rules) runs on every public page, in light and dark themes and on desktop and phone, with no violations:
  - landing, demo vault, demo application, login, signup, privacy, terms, contact, and not-found;
  - every signed-in screen: all four workspace tabs, applications, new application, vault, settings, upgrade and onboarding.
  
  Built in from M1: skip link, visible focus, labelled controls, 44px targets, live regions for progress and saves, reduced motion, and status that is never shown by color alone.
- **Mobile:** every one of those screens is checked at 375×812 for sideways scrolling, plus spot visual checks. The resume download bar is sticky at the bottom.
- **Errors and empty states:**
  - Error boundaries for the app and the root, plus a global error page. Each says your work is saved and offers Try again and a way home. Only the error digest is logged, never content.
  - A friendly not-found page.
  - Loading skeletons on every data screen (Suspense, from M1–M7).
  - Empty states for applications, vault and new application, built earlier.
- **SEO:**
  - Title template, description, keywords, Open Graph and Twitter card.
  - `robots.txt` that keeps private app paths and the API out of search.
  - `sitemap.xml` of public pages.
  - A generated 1200×630 Open Graph image.
- **Analytics hook:** off by default. With `NEXT_PUBLIC_ANALYTICS_DOMAIN` set, a cookie-free Plausible-compatible script loads and five named events are counted. No personal content is sent, which matches the Privacy page.
- **README:** local setup, AI modes, scripts, and deploy steps for Supabase, Auth URLs, Google, production SMTP, Stripe, Vercel, and a final check.
- **SPEC §14 journey test** on desktop and phone: sign up → upload resume → confirm all → new application → answer a question → reload, answer persisted → write resume → flagged line excluded → Word + PDF export, PDF ≤ 1 page → change status, persisted → delete account.
- **Release check:** a fresh clone gets `npm ci`, typecheck, lint and unit tests, then a production build with only public env vars set. The export fonts are confirmed in the build's file trace for Vercel.
- Final counts: 202 unit, 18 RLS and 40 E2E (desktop + mobile), all passing.

Known limits and follow-ups:
- AI responses in tests were written by hand to the prompt rules, because there was no API key here. Run `npm run test:live` once `ANTHROPIC_API_KEY` is set, and re-record any fixture whose live wording differs.
- Stripe has only been exercised with locally signed events. Do the live test-mode run in M7's notes once keys are in.
- The posting URL field is saved for reference only; we never fetch it (SPEC: pasted text is the v1 path).
- Privacy and Terms are solid drafts. Have a lawyer review them before launch (noted in code comments).

### Hardening after independent reviews

Two separate review passes (security and correctness) were run over the finished code. Every finding was checked against the code before it was fixed.

Security (6):
- **AI limits under parallel requests.** Each call now reserves its slot in one locked database function (`reserve_ai_call`) before the model runs. The reserved row holds a worst-case cost and is settled with real usage afterwards. Failed calls with known usage are billed, and cancelled calls keep the estimate. Prompts over 200k characters are refused.
- **Plan limits.**
  - Imports are reserved atomically before the AI runs, and released if it fails.
  - `create_application` counts the application limit in its own transaction.
  - Users can't insert applications or requirements directly any more.
  - Text sent to the AI has size limits.
- **Open redirect after sign-in.** `safeNextPath` now resolves the target the way a browser does and refuses anything that leaves the site.
- **Checkout replay.** The success page reads the subscription's current status, so an old success link can't restore a cancelled plan.
- **Internal SQL functions** (`next_code` and the trigger functions) are no longer executable by `anon` or `authenticated` users.
- **Uploads** are refused by their declared size before the body is read.

Correctness (12):
- **AI retries.** Structured output is now validated in our own code, after checking why the model stopped, so the "retry once on bad output" path actually runs.
- **Cover letter autosave race.** A slow save can no longer mark newer typing as saved.
- **Authority check.** A fact that only mentions a manager or supervisor no longer backs a "Managed…" or "Directed…" line.
- **Years claims (core rule 9).** The summary gets a soft flag when its years claim isn't supported by the dates. With year-only dates, plain claims are bounded by the most generous reading of those dates.
- **Gaps.** Only the person can declare a gap. An off-topic answer saves nothing and asks again.
- **Re-import.** A fact's corrected wording and a renamed job's old name are remembered, so re-importing the original resume doesn't bring them back.
- **Boilerplate filter.** It no longer drops real requirements that mention pay or benefits words.
- **Smaller fixes:**
  - Edit opens with the current text after a Rewrite.
  - A "not ok" fact-check verdict wins over a duplicate "ok".
  - A year-only start in the current year is counted.

Known, left as is: spelled-out numbers ("twelve") and unit changes ("$40K" vs "$40M") are caught only by the AI fact-check pass, not the code check.

Tests now: 232 unit, 23 RLS and 40 E2E, all passing.

