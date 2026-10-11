# Build CareerProof: production SaaS

You are building **CareerProof**, a paid web app that helps job seekers create truthful, targeted resumes and cover letters. Build a complete, working, deployable product, not a prototype. No stubs, no placeholder pages, no "TODO: implement". If something can't be finished, stop and tell me exactly what is missing.

Read this whole document before writing code. Then:
1. Write `PLAN.md`: your file structure, database schema, and the milestone order below, with anything you think is wrong or missing in this spec.
2. Build milestone by milestone. At the end of each milestone, run typecheck, lint, and tests, fix failures, commit, and summarize what works.
3. Keep this file in the repo as `SPEC.md` and keep `PLAN.md` updated as you go.

---

## 1. The product in one paragraph

A user uploads their resume once. CareerProof splits it into individual facts (jobs, duties, accomplishments, skills, education, certifications) that the user reviews and confirms. This is their **Career Vault**. For each job they apply to, they paste the posting. CareerProof shows which requirements their confirmed facts support, asks only a few focused questions about what's genuinely unclear, saves the answers to the vault for reuse, and writes a tailored resume and cover letter where **every line cites the facts it came from** and is fact-checked before it can be downloaded. Exports are Word (.docx) and PDF, fitted to a page target.

**The promise:** CareerProof remembers your career, explains its comparisons, asks only what it still needs, and produces documents you can defend in an interview.

**Who it's for:** everyday job seekers, including people who aren't comfortable with technology. Every screen must be obvious without instructions. Plain language everywhere. No jargon like "evidence vault schema" in the UI.

---

## 2. Tech stack (use exactly this unless you flag a strong reason)

- **Next.js** (latest stable, App Router), **TypeScript** strict mode, **React Server Components** where sensible
- **Tailwind CSS** + **shadcn/ui**
- **Supabase**: Auth (email magic link + Google OAuth), Postgres, Storage (private bucket for uploaded resumes), Row Level Security on every table
- **Anthropic API** via the official TypeScript SDK, called **only from the server**. Default model `claude-sonnet-5-5`; use `claude-haiku-5-5` for small fast tasks (answer cleanup). Check the current Anthropic docs for the SDK's structured-output / tool-use API and use it to force JSON that matches a schema.
- **Zod** for validating every AI response and every API input
- **Stripe** for subscriptions (Checkout + Customer Portal + webhooks)
- **docx** (npm) for Word export; **@react-pdf/renderer** (or another server-side PDF library you justify) for PDF export
- **mammoth** for .docx text extraction; **unpdf** or **pdfjs-dist** for PDF text extraction
- **Vitest** for unit tests, **Playwright** for end-to-end tests
- Deploy target: **Vercel** + Supabase cloud

Put all AI calls behind a provider-neutral interface (`lib/ai/provider.ts`) so the model or vendor can be swapped. The AI never decides verification status, ownership, or permissions. Code does.

---

## 3. Core rules (these are the product; never violate them)

1. **"Confirmed" means the user confirmed it.** Never imply an employer, school, or issuer verified anything. Use the word "Confirmed" in the UI, never "Verified."
2. **Only confirmed facts can appear in exported documents.** Unconfirmed facts may appear as possible matches, clearly labeled.
3. **Every generated resume line and summary cites fact IDs.** A line with no valid citation cannot be exported.
4. **Unknown is not a gap.** A requirement with no supporting facts is "Not in your record yet." It becomes "You don't have this" only when the user says so.
5. **Don't stretch evidence.** Completing training in a system ≠ administering it. Helping coworkers ≠ supervising them. A degree in progress ≠ a completed degree.
6. **Never ask a question the vault already answers.** Questions build on what the record says and ask for the specific missing part.
7. **The vault is separate from each tailored resume.** Unchecking a bullet in one application never deletes the underlying fact.
8. **Enforce export rules on the server**, not just by disabling buttons.
9. **Date math is code, not AI.** Years of experience = merged employment intervals with overlaps counted once. If a summary claim ("8+ years") disagrees with the dates, show the discrepancy instead of picking the bigger number.
10. **Send the AI only what each task needs.** Resumes are personal data.

---

## 4. User flow and screens

Mobile-first. Must work well at 375px wide and on desktop. Five main areas:

### 4.1 Landing page (public, logged out)
- Headline: "Your career, on the record." Subhead explaining the promise in one sentence.
- Primary button: "Get started free". Secondary: "See an example" (opens a read-only demo with sample data for a made-up person, no sign-in required).
- Three-step "How it works" (Build your vault → Paste a job → Download your resume).
- A static example of a requirement match card (one "Supported", one "Partly supported" with the question it would ask).
- Trust line: "Confirmed means you confirmed it. CareerProof won't write a line your facts don't support."
- Pricing section, FAQ, footer with Privacy, Terms, Contact.

### 4.2 Onboarding: Add your resume
- Upload .docx, .pdf, or .txt (max 5 MB), or paste text. Show extracted text so the user can see what was read.
- Detect problems explicitly: scanned/image-only PDF (almost no text), old .doc files, garbled text. Tell the user what to do instead. Never silently produce a thin vault.
- "Read my resume" → progress state ("Reading your resume…", typically 20–60 s, with a cancel button) → Vault review.
- Store the original file in Supabase Storage (private) and record it in `source_documents`.

### 4.3 Career Vault
- Header: name, headline, contact; stats: total work history (overlaps counted once), confirmed facts, items waiting.
- Banner when anything is unconfirmed: "Check these over, then confirm." with **Confirm all** button.
- Work history: each job (title, employer, location, dates, duration, "dates unclear" flag) with its facts underneath.
- Separate sections: Skills, Education, Certifications, Training, From your answers, Summary claims, Other.
- Each fact row: short ID (E1, E2…), text, "From resume: '…exact source passage…'", status (Confirmed pill or Confirm button), Edit (editing a fact confirms it and stores a revision), Remove (inline two-step confirm, no browser dialogs).
- Edit job details (title, employer, dates).
- "+ Add a fact yourself" (type, optional role, text → saved as confirmed, origin "manual").
- "Add another resume": re-import merges, recognizes existing facts by normalized text and existing jobs by employer + title, never duplicates or overwrites confirmed facts. Show what's new.

### 4.4 Applications list (home after onboarding)
- Each application: job title, employer, date, "4 of 6 required met", small colored status bar, and a status dropdown (Draft, Applied, Interviewing, Offer, Closed).
- Prominent "New application" button. Empty state explains what to do.
- If vault has unconfirmed items: warning with link to review.

### 4.5 New application
- Paste the full job posting (also accept a URL field in a later milestone; pasted text is the v1 path).
- "Compare with my career" → progress → Application workspace.

### 4.6 Application workspace (tabs: Match · Resume · Cover letter · Posting)

**Match tab**
- Score card: "X / Y required qualifications supported", "A / B preferred", a segmented bar with one segment per requirement colored by status, and a legend.
- "Left out of matching: pay, benefits, location…" note.
- **Questions** section (max 4 total, required items first): shows what it's about, the question, a text box, "Save answer", and "I don't have this". Saving an answer: AI turns it into one clean factual statement (keeping the user's numbers, adding nothing), saves it to the vault as a fact with origin "answer" and status unconfirmed, shows "Added to your vault as E19: …" with **Looks right** / **Edit in vault**, and re-judges that requirement. Answers persist across reloads and are reused by future applications automatically (they're vault facts).
- Requirements grouped Required / Preferred. Each shows: requirement text, status pill, plain-language explanation, years calculation when relevant ("Lead Custodian + Custodian: 10 yrs 7 mos of relevant experience, overlapping months counted once. This asks for 3."), tappable fact-ID chips that expand to show the fact text and whether it's confirmed, and a "Confirm E12" button when a requirement is only held back by unconfirmed facts.
- Status labels: **Supported** (strong), **Partly supported** (partial), **Needs your OK** (hidden / unconfirmed), **Not in your record yet** (unknown), **You don't have this** (gap, user-declared, with Undo).

**Resume tab**
- Page target: Strictly one page / One page if possible / Up to two pages.
- "Write my resume" → generation → automatic fact-check pass → preview.
- Preview looks like a real resume (white paper, Arial). Name, contact, Summary, Experience (titles/employers/dates printed from the vault, never from AI), Skills, Education, Certifications (from confirmed vault facts).
- Each bullet has: include checkbox, text, Truth Guard badge (**Supported** / **Check this** / **Can't be used** / **Reviewed by you**), fact-ID chips that expand to show the cited facts, Edit, and for "Check this" an "It's accurate" button. Flag reasons are shown in plain language under the bullet.
- Banner: either "Every included line is backed by a confirmed fact" or "N lines need a look. They stay out of your download until you edit them or confirm they're accurate."
- Rewrite button. Edits to bullets save automatically and clear old fact-check results (re-run the code checks immediately).
- Sticky bottom export bar: page-count note, **Word** and **PDF** buttons.

**Cover letter tab**
- "Write my cover letter" (streams in), then an editable text area that autosaves. Word count. Copy, Word, PDF buttons. Uses only confirmed facts behind the strongest matches.

**Posting tab**: the original posting text.

### 4.7 Settings / Account
- Profile (name, email, phone, location used on documents)
- Plan & billing (Stripe Customer Portal link, usage this month)
- **Download my data** (JSON export of vault + applications)
- **Delete my account** (deletes all rows and stored files; typed confirmation)

---

## 5. Data model (Postgres, all tables owned by `user_id` with RLS `user_id = auth.uid()`)

Write SQL migrations in `supabase/migrations`. Use UUID primary keys, `created_at`/`updated_at` timestamps, and a short human-readable `code` per user for facts (E1, E2…) and jobs.

- `profiles`: user_id (PK, FK auth.users), full_name, email, phone, location, headline, plan, stripe_customer_id, created_at
- `source_documents`: id, user_id, storage_path, filename, mime_type, extracted_text, extraction_warnings jsonb, created_at
- `jobs` (employment): id, user_id, code (j1…), employer, title, location, start_date text (YYYY-MM | YYYY), end_date text (YYYY-MM | YYYY | present), dates_uncertain bool, status (confirmed | pending), source_document_id
- `facts`: id, user_id, code (E1…), type (duty | accomplishment | skill | education | certification | training | summary_claim | answer | other), job_id nullable, text, source_passage, source_document_id nullable, origin (resume | answer | manual), explicit bool, note, status (confirmed | pending | unsupported), extraction_confidence numeric nullable (separate from status!), confirmed_at, answered_requirement_id nullable
- `fact_revisions`: id, fact_id, user_id, previous_text, new_text, created_at
- `applications`: id, user_id, title, employer, posting_text, posting_url, ignored_note, status (draft | applied | interviewing | offer | closed), created_at
- `requirements`: id, application_id, user_id, code (R1…), text, kind (required | preferred), logic (all | any), parts text[], ai_status (strong | partial | hidden | unknown), explanation, question, years_required numeric, relevant_job_ids uuid[], user_gap bool, answered bool, position int
- `requirement_evidence`: requirement_id, fact_id, user_id (join table)
- `documents`: id, application_id, user_id, kind (resume | cover_letter), version int, page_target, content jsonb (structured resume: summary, jobs[{job_id, bullets[{id, text, fact_ids, requirement_codes, relevance, included, reviewed, ai_check{ok, issue}}]}], skills[{text, fact_ids}]) or text for letters, created_at. Keep every version; the UI shows the latest.
- `ai_calls`: id, user_id, task, model, input_tokens, output_tokens, latency_ms, success, error_code, created_at (for usage limits and cost tracking; never store prompt content)

Derived status (compute in code, `lib/matching/status.ts`, never stored as truth):
```
if user_gap → gap
if years_required and relevant jobs exist and not answered:
  months = mergedMonths(relevant jobs)
  months >= years_required*12 → (all those jobs confirmed ? strong : hidden)
  months > 0 → partial, else unknown
if ai_status == strong:
  no cited facts → unknown
  any cited fact not confirmed → hidden
else → ai_status
```

---

## 6. Server API (Route Handlers or Server Actions; all validate input with Zod and check auth + ownership)

- `POST /api/resume/extract-text`: upload → stored file → extracted text + warnings
- `POST /api/vault/import`: text → AI extraction → merge into vault (dedupe) → returns new items
- CRUD for facts and jobs, `POST /api/vault/confirm-all`
- `POST /api/applications`: posting text → AI analysis → requirements saved
- `POST /api/applications/:id/answer`: requirement + answer → new fact + re-judged requirement
- `POST /api/applications/:id/resume`: generate → code guard → AI fact-check → save new document version
- `PATCH /api/documents/:id`: bullet edits, include toggles, "reviewed" marks
- `POST /api/applications/:id/cover-letter`: streaming response
- `GET /api/documents/:id/export?format=docx|pdf`: **server re-runs Truth Guard and page fitting**, refuses to include any non-exportable line, returns the file
- `POST /api/stripe/checkout`, `POST /api/stripe/portal`, `POST /api/stripe/webhook`
- `GET /api/account/export`, `DELETE /api/account`

Rate-limit AI routes per user. Enforce plan limits on the server.

---

## 7. AI tasks and prompts

Each task lives in `lib/ai/tasks/<name>.ts` with: the prompt builder, a Zod schema, and a function that calls the provider with forced structured output, validates, and post-processes in code. Log each call to `ai_calls`. On invalid output, retry once, then return a clear error.

### 7.1 Extract resume → structured facts
Prompt intent (refine wording, keep every rule):
> You are reading a resume to build a structured career record. Extract ONLY what the resume states. Never add skills, numbers, tools, titles or outcomes that are not written.
> - Contact details go in profile, never in facts.
> - Each job heading becomes one job; duties under it become facts linked to that job.
> - One short, self-contained statement per fact, same meaning as the resume; light grammar cleanup only.
> - Skills lists: one fact per distinct skill or tool.
> - Education: one fact per credential with completion stated plainly (completed / in progress with expected date / unfinished). Never present unfinished study as completed.
> - Certifications/licenses vs. general training are different types.
> - Summary-section claims ("8+ years") are type summary_claim and stay separate from job facts.
> - Dates: "YYYY-MM", "YYYY", or "present"; flag uncertain dates.
> - source = exact passage, max 25 words.
> - warnings = real problems (garbled text, likely scanned, missing dates, unreadable sections).

Schema: `{ profile{name,email,phone,location,headline}, jobs[{key,employer,title,location,start,end,datesUncertain}], facts[{type,jobKey|null,text,source,note}], warnings[] }`

Code post-processing: map job keys to DB ids, dedupe against existing vault, insert as **pending**, sort jobs by end date desc.

### 7.2 Analyze posting against vault
Input: jobs (with code-computed durations) and all facts with codes and confirmed/unconfirmed labels, plus the posting.
Rules to include:
> - Ignore pay, benefits, location, schedule, company background, EEO text, application instructions and section headings. Never turn them into requirements.
> - Merge near-duplicates; 6–12 requirements; required vs preferred from the posting's wording.
> - Preserve logic: "X or Y" → any; "X and Y" → all; list the parts.
> - Cite fact codes. Status: strong (fully supported), partial (meaningful part missing), hidden (likely has it, needs clarification), unknown (nothing addresses it). Never mark a gap.
> - Don't stretch evidence (see core rule 5).
> - For minimum years: return yearsRequired and relevantJobs; do NOT compute years.
> - Question only when partial/hidden/unknown AND an answer could add a real fact; it must build on what the record says and ask for the specific missing part. Max 4, required first.
> - Write explanations to the candidate as "you", one or two plain sentences.

Schema: `{ title, employer, ignored, requirements[{text,kind,logic,parts[],status,evidence[],explanation,question|null,yearsRequired|null,relevantJobs[]}] }`

Code post-processing: drop citations to codes that don't exist or aren't this user's; drop questions on requirements whose derived status is strong; cap questions at 4.

### 7.3 Turn an answer into a fact (haiku model)
> Turn their answer into one factual resume-style statement (no "I"). ONLY what the answer says; keep numbers exactly; add no scope, titles, or results. If they say they lack it, has=false. Then re-judge: strong / partial / gap, with a one-sentence explanation.

Schema: `{ has, statement, status, explanation }`

### 7.4 Generate tailored resume
Input: requirements with derived statuses, **confirmed facts only**, jobs, page target.
> - Every bullet cites the fact codes it rewrites; combining related facts is fine.
> - Rephrase for clarity and relevance; use the posting's vocabulary only where facts support it.
> - Never add numbers, tools, team sizes, results, authority (led, managed, supervised, administered) or scope the cited facts don't state.
> - Don't output titles/employers/dates (the app prints them from the vault).
> - relevance: 3 = addresses a required item, 2 = supports one, 1 = general. Order by relevance.
> - Length: one page ≈ 10–14 bullets total; two pages ≈ 4–6 per recent role.
> - Summary 1–2 sentences with citations; don't restate summary claims the dates don't support.
> - Skills: up to 10, each cited.

Schema: `{ summary{text,evidence[]}, jobs[{job,bullets[{text,evidence[],requirements[],relevance}]}], skills[{text,evidence[]}] }`

### 7.5 Fact-check pass (separate call, after generation and after any regeneration)
> Strict fact-checker. Compare each bullet ONLY to the evidence it cites. Flag anything not stated: higher authority/ownership, larger scope or team size, new tools, numbers, outcomes, credentials, or completed status for something unfinished. Rewording, reordering and combining are fine.

Schema: `[{ i, ok, issue }]`

### 7.6 Cover letter (streamed)
> Use ONLY these confirmed facts. 230–320 words, 3–4 short paragraphs. Open with the specific role and one real reason they fit. Focus on 2–3 connections; don't repeat the resume. Warm, direct, plain; no clichés like "I am writing to express my interest". "Dear Hiring Manager," … "Sincerely, <name>". No address block, no bracket placeholders, no date line.

---

## 8. Truth Guard (code, `lib/guard/`, shared by client preview and server export)

For each bullet compute flags:
- **Hard (can't be used):** no valid citation; cites a fact that isn't confirmed or doesn't belong to the user.
- **Soft (check this):** any number in the bullet (strip commas; include %) that doesn't appear in the cited facts' text; an authority word (led, lead, managed, manage*, supervis*, direct*, administ*, oversaw, oversee*, headed, owned, spearhead*, chair*) when none of the cited facts contain one; AI fact-check `ok:false` with its issue.
- Exportable = no hard flags AND (no soft flags OR user marked reviewed).
- Editing a bullet clears `reviewed` and the AI check, then re-runs code checks.
- The summary follows the same rules; a failing summary is omitted from export with a visible note.

Unit-test this module thoroughly (numbers, percentages, comma numbers, authority words, unconfirmed citations, reviewed override).

---

## 9. Export and page fitting (`lib/render/`)

- One structured resume model → two renderers (DOCX and PDF) using the same fonts (Arial / Liberation Sans fallback), sizes, margins, and spacing so page counts match.
- Layout steps tried in order until the page target fits: (10.5pt, 0.75" margins) → (10.5pt, 0.6") → (10pt, 0.6") → (10pt, 0.5"). Never go below 10pt or 0.5".
- **Measure the actual generated PDF's page count.** A browser preview is not proof.
- If "Strictly one page" still doesn't fit at the smallest layout: don't export. Return the lowest-relevance bullets that would need to go (relevance 1 and bullets addressing no requirement first, older roles before recent ones) and let the user remove them with one tap. Content changes are always shown to the user, never silent.
- "One page if possible": fit if achievable, otherwise export two pages with a note.
- Show the result: "1 page · 10.5pt text, 0.6" margins".
- Resume layout: name (large, bold), contact line, section headings in small caps/uppercase with a thin rule, job title bold with dates right-aligned (tab stop in DOCX), employer line, real bullet lists (DOCX numbering), skills joined with " • ".
- Filenames: `Jordan Rivera - Mercy Valley Health.docx`, `… - Cover Letter.pdf`.
- Cover letter: name, contact, date, paragraphs, 1" margins, 11pt.

---

## 10. Monetization (Stripe)

- **Free:** 1 resume import, 2 applications total, watermark-free exports (don't cripple quality).
- **Pro:** monthly and annual (configure prices in env; e.g. $12/mo, $96/yr): unlimited applications, re-imports, cover letters.
- Limits enforced server-side using `profiles.plan` and counts. Friendly upgrade prompt when a limit is hit, never a dead end.
- Stripe Checkout for upgrade, Customer Portal for managing/canceling, webhook updates `profiles.plan` (handle `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`). Verify webhook signatures.
- Track AI cost per user in `ai_calls`; add a hard monthly safety cap per user (configurable) to protect margins.

---

## 11. Design direction

- Clean, calm, trustworthy, a little distinctive; it should feel like a careful professional tool, not a generic AI app. Avoid purple gradients, emoji section markers, and cream-and-terracotta.
- Palette: cool near-white background with a slight green tint, deep teal accent (`#0E6B5B`) for "Supported/Confirmed", amber for "Partly supported", muted blue for "Needs your OK", grey for "Not in your record yet", brick red for "You don't have this". Full dark mode with matching tokens.
- Type: a characterful display face for headings (e.g. Bricolage Grotesque), a plain readable body face (e.g. Public Sans), and a monospace face for fact codes (e.g. JetBrains Mono). Load with `next/font`.
- Big tap targets, visible focus states, WCAG AA contrast, `prefers-reduced-motion` respected, works with screen readers (labels on every control, live regions for progress).
- Every AI action shows a progress state with realistic timing text and a Cancel button. Every error says what happened and what to do next.
- Copy is plain and direct, written from the user's side ("Confirm all 24", "Read my resume", "Compare with my career").

---

## 12. Demo mode

A public `/demo` route with a fixed sample person (Jordan Rivera, Lead Custodian at Riverside Regional Medical Center 2019-06–present; Custodian at Franklin County Schools 2016-03–2019-08; A.A.S. completed 2021; B.S. in progress expected 2027; OSHA 10; CHEST certification; skills including an unconfirmed "Microsoft Teams") and a pre-computed application for "Training & Compliance Coordinator at Mercy Valley Health" that shows every status type, two questions, and one bullet flagged by Truth Guard ("Managed LMS training compliance…" citing a fact that only says they completed LMS training and helped coworkers access courses). Demo is read-only and makes no AI calls. Banner: "Sample data for a made-up person."

---

## 13. Security and privacy

- RLS on every table; test that user A cannot read or write user B's rows (automated test).
- Private storage bucket; signed URLs only; files scoped to `user_id/` paths.
- Never log resume text, postings, or prompts. Log only metadata.
- Secrets only in env vars; nothing sensitive in client bundles.
- Input size limits (resume text ≤ 60k chars, posting ≤ 40k chars, file ≤ 5 MB).
- Privacy policy and Terms pages with real, plain-language content describing what's stored, that resume text is sent to an AI provider for processing, and how to delete everything (mark them "review with a lawyer before launch" in a code comment, not in the UI).

---

## 14. Testing

- **Unit (Vitest):** date parsing and merged months (overlaps, "present", year-only dates, invalid dates), derived status logic, Truth Guard, dedupe/merge on re-import, page-fit cut selection, Zod schemas against sample AI outputs.
- **AI fixtures:** create `tests/fixtures/` with 5 realistic resumes (your own sample: custodial lead; career changer; new grad with internships; resume with a skills table; text from a scanned PDF that should trigger a warning) and 3 postings. Record AI responses as fixtures so tests run without the API; add an opt-in `npm run test:live` that hits the real API.
- **E2E (Playwright, mocked AI):** sign up → upload resume → confirm all → new application → answer a question → reload and see the answer persisted → generate resume → see flagged bullet excluded → export DOCX and PDF → verify PDF page count ≤ target → change application status → delete account.
- Mobile viewport E2E run (375×812).

---

## 15. Milestones and acceptance criteria

1. **Foundation:** Next.js app, Tailwind/shadcn, design tokens + dark mode, Supabase auth (magic link + Google), migrations with RLS, landing page, demo route with sample data. ✅ when a new user can sign up, land on onboarding, and the demo renders every status type.
2. **Resume import + Vault:** upload/paste, text extraction with warnings, AI extraction, vault review, confirm all, edit (with revisions), remove, add fact, re-import without duplicates. ✅ when all 5 fixture resumes import correctly (jobs, dates, education status, skills separate from duties) and confirmations survive reload.
3. **Job analysis + Match + Questions:** posting analysis, derived statuses, years math, evidence chips, confirm-from-match, questions with answer → fact → re-judge, "I don't have this" with undo. ✅ when boilerplate never becomes a requirement, no question repeats vault info, and answers persist and are reused by a second application.
4. **Resume Studio + Truth Guard:** generation, fact-check pass, bullet editing/include/reviewed, page target. ✅ when every bullet cites confirmed facts and the demo's inflated bullet is flagged.
5. **Export:** DOCX + PDF from one model, page fitting with measured page count, server-side guard enforcement, cover letter generation/editing/export. ✅ when a strict one-page resume exports as exactly one page in both formats and a non-exportable line can't be forced through the API.
6. **Applications tracker + Account:** list, statuses, settings, data export, account deletion. ✅ when deletion removes all rows and files.
7. **Billing:** Stripe plans, limits, upgrade flow, portal, webhooks, AI cost cap. ✅ when a free user hits the limit, upgrades in Stripe test mode, and immediately gets Pro access.
8. **Polish + release:** accessibility pass, mobile pass, empty/error/loading states everywhere, SEO metadata, Open Graph image, analytics hook (privacy-friendly), README with setup and deploy steps, `.env.example`. ✅ when the full Playwright suite passes on desktop and mobile and a fresh clone deploys to Vercel by following the README.

---

## 16. Environment variables (`.env.example`)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
AI_MODEL_DEFAULT=claude-sonnet-5-5
AI_MODEL_FAST=claude-haiku-5-5
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_PRO_MONTHLY=
STRIPE_PRICE_PRO_YEARLY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
AI_MONTHLY_COST_CAP_USD=5
```

---

## 17. Working agreements for you (Claude Code)

- Start by writing `PLAN.md`, then wait for my "go" before Milestone 1.
- After each milestone: run `npm run typecheck && npm run lint && npm test`, fix everything, commit with a clear message, and give me a short summary plus anything I need to do (create accounts, paste keys, click something in Supabase/Stripe).
- When you need a key or account you don't have, tell me exactly where to get it and which env var it goes in, then keep building everything you can with mocks.
- Don't silently change the core rules in Section 3. If you think one is wrong, say so.
- Prefer simple, well-named code over clever abstractions. Keep files small and focused.
