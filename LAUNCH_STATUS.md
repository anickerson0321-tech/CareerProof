# CareerProof v1.0 launch status

Updated: November 10, 2026. **Definition of Done: NOT MET. No production deployment or live workflow has been verified.**

## Current phase and source

Phase A: repository verification and targeted launch corrections prepared. Phase B is blocked on Supabase account authorization. Phases C–E remain unverified.

- Repository: https://github.com/anickerson0321-tech/CareerProof
- Verified `main`: `3ec0aaf2cd48b160f26ac38207b208caa93aa3fe` (merged PR #2).
- PR #2: https://github.com/anickerson0321-tech/CareerProof/pull/2 — merged, with `LAUNCH.md`, Vercel URL fallback, and both Supabase key styles present.
- Current `main` push CI run [42849706678](https://github.com/anickerson0321-tech/CareerProof/actions/runs/42849706678): completed successfully, inspected during this assignment. PR #2 head run `39024691180` also succeeded. Neither establishes acceptance of the new launch corrections or a live deployment.
- Launch branch: `codex/private-launch-readiness`. Changes require review; no production merge is authorized.
- Deployment URL / Vercel project ID / Supabase project ID: **unknown; not inspected with authorized cloud access**. No cloud project was created, no database reset, and no paid AI request was made.

## Completed work

- Read `AGENTS.md`, `LAUNCH.md`, `README.md`, `PLAN.md`, `SPEC.md`, `.env.example`, database migrations, CI/test configuration, and relevant application/AI/export/security code.
- Installed the locked dependencies and reran checks instead of relying on reported counts.
- Patched Next.js and its ESLint config from 16.4.0 to 16.4.6 after the production build raised a security failure. Maintainer advisory: https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr (the audit also identified image-optimization RCE and Server Action DoS advisories). Actual exploitability of each advisory in CareerProof was not established; updating removes the affected dependency version.
- Applied compatible audit fixes, including Zod 4.6.7 and Undici 7.30.2. No forced major upgrades.
- Included cover letters for Free accounts so the required v1.0 workflow does not depend on postponed Stripe billing. Updated UI gating and regression coverage. Existing one-import/two-application limits, RLS and AI cost/rate controls remain.
- Made the existing Word/PDF parity tests accept `SOFFICE_EXECUTABLE`, enabling all five checks with the installed renderer.
- Bound the Playwright test server explicitly to loopback, avoiding an environment-specific network-interface enumeration failure.
- Added production-build and public desktop/mobile browser checks to CI. The public browser subset does not require cloud credentials. It is not the full signed-in suite.
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
| Local public Playwright subset | **Blocked: 14 tests failed before page execution** | Chromium startup denied Unix socket creation (`Operation not permitted`); not application assertion failures |
| Local full signed-in E2E | Not run successfully | `npm run db:start` reports Docker/Podman unavailable; requires Supabase Auth, REST, Storage and Mailpit, not just PostgreSQL |
| Real Anthropic tests | **5 skipped** | No API key was available. No billable request was initiated. This is not a pass |
| Production workflows | **All unverified** | No verified deployment URL or authorized cloud account access |

## Blocking requirements, in order

1. **Connect Supabase to this chat through secure authorization.** Inspect existing projects before creating anything. Check migration history and existing data, then apply only missing migrations and verify actual policies/bucket settings. This is the owner's next action.
2. Connect Vercel through secure authorization. Inspect/reuse the existing project, repository/branch/build settings, environment variable names and deployment history. Protect **all deployment URLs**, including production, before deployment. Never enable public access or start a paid plan without approval.
3. Configure Anthropic through a secret-management interface, verify account access to the configured models, and obtain a concrete spend ceiling before making any billable test call. No keys/passwords/tokens in chat. Set `AI_PROVIDER=anthropic` on the deployed site.
4. Review the launch PR and obtain approval before merging significant changes into `main`. Do not silently merge or use a mocked AI deployment as the final result.
5. Deploy, record its exact URL and commit, verify signed-out access is restricted, configure precise Supabase callback URLs, and run the full production acceptance matrix below. Resolve critical failures before marking release complete.

Both cloud dashboards showed sign-in screens during this assignment. Existing projects therefore may exist; their absence has **not** been established. Supabase and Vercel connections were available to add but were not connected at the time checked.

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

**Next required owner action: authorize the Supabase connection.** Then inspect actual projects and continue Phase B without asking for project details already accessible through that connection.
