# CareerProof v1.0 launch status

Updated: November 11, 2026. **Definition of Done: NOT MET. No production deployment or live workflow has been verified.**

## Current phase and source

Phase A: repository corrections merged in PR #3 and automated browser verification completed. Phase B: existing Supabase project restored and database/storage configuration inspected; Auth settings and application access remain unverified. Phase C awaits secure Anthropic configuration and paid-test approval. Phase D: approved CareerProof-only GitHub app installed; protected Vercel Hobby project created and connected, with framework/runtime and six non-secret production variables configured. Server secrets and contact email remain missing. Phase E remains unverified.

- Repository: https://github.com/anickerson0321-tech/CareerProof
- Verified `main`: `57e60559a9ee15a4ac349f5274a80671663699e9` (merged PR #3, November 10, 2026).
- PR #2: https://github.com/anickerson0321-tech/CareerProof/pull/2 — merged, with `LAUNCH.md`, Vercel URL fallback, and both Supabase key styles present.
- Earlier main push CI run [42849706678](https://github.com/anickerson0321-tech/CareerProof/actions/runs/42849706678): completed successfully, inspected during this assignment. PR #2 head run `39024691180` also succeeded. Neither establishes acceptance of the new launch corrections or a live deployment.
- Launch fixes: `codex/private-launch-readiness`; [PR #3](https://github.com/anickerson0321-tech/CareerProof/pull/3) is merged. This session inspected the merge; it did not perform it. Current documentation branch: `codex/launch-connection-status`; [PR #4](https://github.com/anickerson0321-tech/CareerProof/pull/4) is open for continuity updates.
- PR #3 CI: [42857545631](https://github.com/anickerson0321-tech/CareerProof/actions/runs/42857545631), head `4e32309`, passed typecheck, lint, 239 unit tests, 23 RLS tests, build and 14 public desktop/mobile browser tests.
- Full signed-in E2E: [42858826054](https://github.com/anickerson0321-tech/CareerProof/actions/runs/42858826054), head `4944f24`, **40/40 passed** with a disposable local Supabase stack and fixture AI. This is not production or real-AI acceptance.
- Follow-up `c8a8555` adds the trigger search-path migration; its CI and full E2E reruns both passed. Head `b1280e5` also passed [CI 42860935529](https://github.com/anickerson0321-tech/CareerProof/actions/runs/42860935529) and [full E2E 42860935911](https://github.com/anickerson0321-tech/CareerProof/actions/runs/42860935911). All 23 local RLS tests pass with the migration; the cloud fix is applied and verified.
- Deployment URL: **none deployed or verified**. Vercel project `careerproof`, ID `prj_gG4avXsnZhPeYwFkI0bFKlWHfjCh`, Hobby team `anickerson0321-tech`. Dashboard: https://vercel.com/anickerson0321-tech/careerproof. Created as an empty hosting project before connecting the existing GitHub repository, so protection could be configured first. No new application or source repository was created. The automatically assigned domain `project-2zkdm.vercel.app` is only a configured alias, not a verified working website.
- Supabase project: existing `careerproof` (`bytknhdrtxcgcnmoussc`), Free plan, us-east-1, API `https://bytknhdrtxcgcnmoussc.supabase.co`. Restored from inactive to **ACTIVE_HEALTHY**. No new cloud project, database reset, paid resource or billable AI request was initiated.

## Completed work

- Read `AGENTS.md`, `LAUNCH.md`, `README.md`, `PLAN.md`, `SPEC.md`, `.env.example`, database migrations, CI/test configuration, and relevant application/AI/export/security code.
- Installed the locked dependencies and reran checks instead of relying on reported counts.
- Patched Next.js and its ESLint config from 16.4.0 to 16.4.6 after the production build raised a security failure. Maintainer advisory: https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr (the audit also identified image-optimization RCE and Server Action DoS advisories). Actual exploitability of each advisory in CareerProof was not established; updating removes the affected dependency version.
- Applied compatible audit fixes, including Zod 4.6.7 and Undici 7.30.2. No forced major upgrades.
- Included cover letters for Free accounts so the required v1.0 workflow does not depend on postponed Stripe billing. Updated UI gating and regression coverage. Existing one-import/two-application limits, RLS and AI cost/rate controls remain.
- Made the existing Word/PDF parity tests accept `SOFFICE_EXECUTABLE`, enabling all five checks with the installed renderer.
- Bound the Playwright test server explicitly to loopback, avoiding an environment-specific network-interface enumeration failure.
- Added production-build/public browser checks and a separate full signed-in E2E workflow. The latter starts a disposable local Supabase stack on GitHub, keeps test keys out of logs, and uses fixture AI. Both workflows have completed successfully on the commits noted above.
- Restored and inspected the existing cloud project instead of creating another. All 11 original migrations are present by name; cloud migration timestamps differ from repository filenames. Do not blindly run `db push`: reconcile migration history under review first, rather than replaying already-applied schema.
- Verified 11 public tables have RLS; inspected ownership policies, profile column grants, service-only AI/import functions, application-RPC ownership checks and same-user foreign keys. Exact counts were zero for Auth users, profiles, facts, jobs, applications and Storage objects.
- Verified the `resumes` bucket is private, limited to 5 MB and PDF/DOCX/text, with user-folder select/insert/update/delete policies. Actual two-account API/file isolation still awaits deployed testing.
- Applied and verified a forward-only `trigger_search_paths` migration fixing two mutable-search-path warnings. Repository file: `20261110165500_trigger_search_paths.sql`; cloud history version: `20261110165659`. No data, grants or account permissions changed.
- Remaining advisor notices are intentional: server-only `stripe_events` has no client policies, and authenticated `create_application` uses SECURITY DEFINER with explicit `auth.uid()` ownership, capped requirements, atomic plan limits, and same-user foreign keys. Read-only inspection confirmed these guards. See remediation links below.
- Updated launch documentation around account reuse, private hosting, secure secret entry, explicit AI-spend approval, migration safety and actual production acceptance.
- Verified Vercel browser sign-in and Hobby account access on November 11. Inspected the initially empty project dashboard. Owner explicitly approved installing the official Vercel GitHub app for CareerProof only. Installation completed (ID `180834721`), then the project was connected to `anickerson0321-tech/CareerProof`; no other repository was selected.
- Created and named the Vercel hosting project, configured Vercel Authentication for All Deployments before connecting source, and disabled project data sharing for model training. These are saved hosting settings; signed-out HTTP protection still needs verification on an actual deployment. No paid plan, domain purchase, automation bypass secret or shareable link was created.
- Set the framework preset to Next.js and selected Node 22.x; repository root is empty (root). Production tracks `main`. The package declares Node >=22, so verify the effective Node version in deployment build logs. Default Basic build machine and disabled on-demand concurrent builds remain.
- Saved six production-only Config variables: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, AI_PROVIDER=anthropic, AI_MODEL_DEFAULT=claude-sonnet-5-5, AI_MODEL_FAST=claude-haiku-5-5, AI_MONTHLY_COST_CAP_USD=5. Public values point to the existing inspected project; no secret values are recorded here. The cap is not permission for paid usage. No real AI request was made.
- Missing production values: SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY), ANTHROPIC_API_KEY, and an owner-approved NEXT_PUBLIC_CONTACT_EMAIL. Supabase tools provide public keys but not the required server key. Supabase dashboard browser access requires sign-in; do not confuse that with the already-working database connector. Enter private keys directly into the hosting Secret interface, never chat.


## Verification evidence

| Check | Current result | Limits |
| --- | --- | --- |
| Baseline TypeScript and ESLint | Pass | Local source check |
| Baseline unit suite | 233 passed, 5 skipped (238 total) | Historical claim of 238 passing was inaccurate in this runtime without renderer discovery |
| Patched TypeScript and ESLint | Pass | Next 16.4.6, updated dependency lock |
| Patched unit suite | **239/239 passed** | Includes one new Free cover-letter regression and all Word/PDF parity checks; local fixture-based AI |
| Database migrations/RLS | **23/23 passed** | Real disposable PostgreSQL 18.6, existing test Supabase auth/storage SQL shim; not cloud Auth/Storage service verification |
| Production dependencies | **0 known vulnerabilities** (`npm audit --omit=dev`) | Advisory database result on this date, not a guarantee of security |
| Development dependencies | 7 moderate reported | All trace to `minimatch` under TypeScript ESLint. Latest stable TypeScript ESLint inspected was 8.72.2, still depending on minimatch `^10.2.2`; no untested major override applied |
| Production build | **Pass (exit 0)** on Next 16.4.6 | Repeated standalone after dependency patches, using synthetic public build settings and no deployed credentials |
| Local HTTP smoke / export packaging | **7/7 routes returned HTTP 200; 4 fonts traced for each export/fit route** | Landing, demo, demo application, login, Privacy, Terms, Contact. HTTP checks do not exercise browser interactions |
| Local public Playwright subset | **Blocked: 14 tests failed before page execution** | Chromium startup denied Unix socket creation (`Operation not permitted`); not application assertion failures |
| Full signed-in E2E on GitHub | **40/40 passed** | Real disposable local Auth/REST/Storage/Mailpit, mocked Anthropic; includes desktop/mobile, persistence, Word/PDF and server-side guard checks |
| Public browser subset on GitHub | **14/14 passed** | Includes light/dark accessibility and overflow checks; supplements the original local Chromium startup limitation |
| Cloud database/storage inspection | **Existing schema and policies inspected; 2 advisor warnings fixed** | Actual production application/API behavior and two-account Auth/Storage isolation remain untested |
| Real Anthropic tests | **5 skipped** | No API key was available. No billable request was initiated. This is not a pass |
| Production workflows | **All unverified** | No deployment URL yet; Vercel and Supabase account access are now verified |

## Blocking requirements, in order

1. **Add the existing Supabase project's server key directly to Vercel as a production Secret** under SUPABASE_SECRET_KEY (or the legacy SUPABASE_SERVICE_ROLE_KEY). The connector cannot retrieve this server key. Repository installation was explicitly approved and completed; do not ask for that approval again.
2. Configure ANTHROPIC_API_KEY through the hosting Secret interface, verify account/model access, and obtain a concrete spend ceiling before any billable test. Anthropic account setup is still unknown. Confirm the owner-approved contact email for NEXT_PUBLIC_CONTACT_EMAIL; do not publish an inferred personal address.
3. Verify persisted protection/build settings, then deploy the existing connected project from `main`. Do not recreate or clone the app/repository, start a paid plan, or grant unrestricted public access. Record commit, actual URL and build logs, and verify the authentication gate with a signed-out request. No mock-AI deployment may count as completion.
4. Inspect actual Supabase Auth providers/email configuration and set exact callbacks once the protected deployment origin is verified. The existing database had no users at inspection; signup/email delivery is still unverified.
5. Execute every production acceptance item below, including two-account isolation and desktop/mobile behavior, and fix critical failures. Prior CI results do not substitute for production evidence.

Supabase connector access, Vercel browser access, and scoped repository connection are verified. Secure server credentials, contact email, paid-test approval and actual deployment/production acceptance remain outstanding. No credentials have been requested in chat.

Remaining intentional Supabase advisor references:
- [No client policies on server-only Stripe events](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- [Authenticated SECURITY DEFINER RPC](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).


## Production acceptance matrix

Every row remains **NOT TESTED ON DEPLOYMENT** until evidence is recorded against the actual protected URL. Use a made-up resume first; obtain approval before sending the owner's private resume to Anthropic. Do not use destructive account-deletion automation against production.

| Required workflow | Production result |
| --- | --- |
| 1. Create account and sign in with real magic-link delivery | Not tested |
| 2. Upload resume and access only its private user folder | Not tested |
| 3. Real Anthropic resume extraction | Not tested |
| 4. Work history, skills and education captured accurately | Not tested |
| 5. Review/correct extracted jobs and facts | Not tested |
| 6. Confirm facts and save to Career Vault | Not tested |
| 7. Sign out, return, and verify saved data persists | Not tested |
| 8. Add job posting | Not tested |
| 9. Analyze required/preferred qualifications | Not tested |
| 10. Generate targeted resume from confirmed evidence | Not tested |
| 11. Generate tailored cover letter without Stripe | Not tested |
| 12. Download Word/PDF documents and inspect contents | Not tested |
| 13. Check generated claims against evidence; verify guard enforcement | Not tested |
| 14. Two-account data and Storage isolation via actual APIs | Not tested |
| 15. Desktop and narrow-phone/foldable workflows | Not tested |

Phone coverage must include a narrow outer-screen-sized viewport, touch targets, keyboard use, scroll/overflow and download behavior; test the actual Galaxy Z Fold7 if available. The existing 375×812 Playwright project alone does not prove physical-device behavior.

## Known limitations and Version 1.1 backlog

Release blockers above are **not** deferred to v1.1.

- Follow upstream TypeScript ESLint/minimatch security fixes for development tooling; avoid an unverified major override solely to clear audit output.
- Configure custom SMTP before wider user invitations exceed Supabase's built-in sender limits; verify current account quotas first.
- Revisit import/application limits for extended personal testing; don't silently grant paid entitlements or change account permissions.
- Optional posting-URL ingestion remains postponed; pasted posting text is the v1 path.
- Payments, domains, marketing, new providers, new modules and Project HQ remain on hold.

## Maintenance / next-agent handoff

Follow `LAUNCH.md`. Use the existing repository and reviewed launch branch. Do not recreate the app. Run typecheck, lint, unit tests, disposable-database RLS, build and E2E after relevant corrections. In environments with a nonstandard LibreOffice install, set `SOFFICE_EXECUTABLE` to its executable path. The RLS suite creates/drops a throwaway database; never aim it at production. Keep resume text, prompts, secrets and private account details out of logs and commits.

**Next required owner action: enter the existing Supabase project's server key directly into Vercel's production Secret form.** Do not paste it in chat. GitHub permission approval is already complete. Preserve the existing Supabase project and its data.
