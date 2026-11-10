# CareerProof v1.0 launch status

Updated: November 10, 2026. **Definition of Done: NOT MET. No production deployment or live workflow has been verified.**

## Current phase and source

Phase A: repository corrections and automated browser verification prepared. Phase B: existing Supabase project restored and database/storage configuration inspected; Auth settings and application access remain unverified. Phase C awaits secure Anthropic configuration and paid-test approval. Phase D awaits Vercel account access. Phase E remains unverified.

- Repository: https://github.com/anickerson0321-tech/CareerProof
- Verified `main`: `3ec0aaf2cd48b160f26ac38207b208caa93aa3fe` (merged PR #2).
- PR #2: https://github.com/anickerson0321-tech/CareerProof/pull/2 — merged, with `LAUNCH.md`, Vercel URL fallback, and both Supabase key styles present.
- Current `main` push CI run [42849706678](https://github.com/anickerson0321-tech/CareerProof/actions/runs/42849706678): completed successfully, inspected during this assignment. PR #2 head run `39024691180` also succeeded. Neither establishes acceptance of the new launch corrections or a live deployment.
- Launch branch: `codex/private-launch-readiness`; [PR #3](https://github.com/anickerson0321-tech/CareerProof/pull/3) is open for review. No production merge is authorized.
- PR #3 CI: [42857545631](https://github.com/anickerson0321-tech/CareerProof/actions/runs/42857545631), head `4e32309`, passed typecheck, lint, 239 unit tests, 23 RLS tests, build and 14 public desktop/mobile browser tests.
- Full signed-in E2E: [42858826054](https://github.com/anickerson0321-tech/CareerProof/actions/runs/42858826054), head `4944f24`, **40/40 passed** with a disposable local Supabase stack and fixture AI. This is not production or real-AI acceptance.
- Follow-up `c8a8555` adds the trigger search-path migration; all 23 local RLS tests pass with that migration, and the cloud fix is applied and verified. Later CI reruns are separate from the two completed runs above.
- Deployment URL / Vercel project ID: **unknown**. The Vercel plugin is installed, but exposes guidance rather than authenticated project-management tools in this session; its browser login still requires secure account sign-in.
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
| Production workflows | **All unverified** | No verified deployment URL or authorized cloud account access |

## Blocking requirements, in order

1. **Complete secure Vercel account sign-in**, or expose an authenticated Vercel MCP connection. The installed Vercel plugin supplies platform guidance, but no authenticated team/project/deployment tools were available. Browser dashboard access is at a login screen. Do not ask the owner to connect Supabase again: its project access now works.
2. Inspect/reuse the existing Vercel project, if any. Confirm repository/branch/build settings and secret variable names. Protect all URLs before deployment. No public release, paid plan or account-permission change without approval.
3. Configure Anthropic through a secret-management interface, verify account access to the configured models, and obtain a concrete spend ceiling before any billable test. Never request keys/passwords/tokens in chat.
4. Review PR #3 and obtain approval before merging significant changes into `main`. Do not merge automatically. No mock-AI deployment may count as completion.
5. Inspect actual Supabase Auth providers/email configuration and set exact callbacks once a protected Vercel origin is known. The existing database has no users; signup/email delivery is still unverified.
6. Deploy, record URL/commit, verify access protection, then execute every production acceptance item below and fix critical failures.

Supabase access is confirmed and the existing project is healthy. Vercel installation is confirmed, but installation alone has not authenticated deployment tools or the cloud browser. No credentials have been requested in chat.

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

**Next required owner action: complete the secure Vercel account sign-in.** Supabase is already accessible; continue from the inspected project and preserve its data.
