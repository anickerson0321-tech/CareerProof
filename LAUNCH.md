# CareerProof v1.0 — private testing launch

Current evidence and blockers: [LAUNCH_STATUS.md](LAUNCH_STATUS.md). This checklist follows the existing Next.js + Supabase + Anthropic + Vercel application. Payments, custom domains, marketing and new providers are postponed.

## 1. Inspect and reuse accounts

Authorize the Supabase connection first, then Vercel, through secure account authorization. Inspect existing organizations/projects before creating anything. Do not paste credentials into chat. Do not create paid resources or add billing without the owner's explicit approval.

## 2. Supabase

- Inspect the project's migration history, database and Auth settings before applying changes.
- Apply only missing files in `supabase/migrations`, in filename order. Never reset a cloud database. Review a backup before changing an existing populated project.
- Check RLS on all public tables, grants, same-user foreign keys, and service-role-only functions.
- Verify `resumes` is private, has a 5 MB limit, allows PDF/DOCX/text only, and uses `<user_id>/…` folder policies. Do not rely on the migration's `on conflict do nothing` to repair an existing bucket's settings.
- Use email magic-link authentication. Google sign-in is optional. Check the email sender permits the owner's address and has enough capacity for two-account isolation testing before inviting anyone.

## 3. Vercel: protect access before deploying

Reuse a project already connected to `anickerson0321-tech/CareerProof`, if present. Check repository, root directory (repository root), production branch (`main`), framework (Next.js), Node 22+, build (`npm run build`) and start settings.

Keep the site restricted for personal testing. Inspect Security → Deployment Protection and configure Vercel Authentication for **All Deployments**, including production domains, before deployment. Verify protection with a signed-out request; application login alone does not make the landing/demo routes private. If the account cannot protect production for free, use a protected preview and record that production acceptance remains incomplete. Never enable unrestricted public access or start a paid plan without approval.

Enter these values directly into Vercel's environment-variable/secret interface:

| Name | Source / behavior |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | The inspected Supabase project's API URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` **or** `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public publishable/anon key; one naming style is enough |
| `SUPABASE_SECRET_KEY` **or** `SUPABASE_SERVICE_ROLE_KEY` | Server-only secret/service-role key; never use a `NEXT_PUBLIC_` name |
| `ANTHROPIC_API_KEY` | Anthropic console; server only |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Owner-approved address; appears on Contact/Privacy/Terms |
| `AI_PROVIDER` | `anthropic`; never `mock` on the deployed testing site |
| `AI_MODEL_DEFAULT` | `claude-sonnet-5-5` |
| `AI_MODEL_FAST` | `claude-haiku-5-5` |
| `AI_MONTHLY_COST_CAP_USD` | `5` default per user per calendar month; this is a ceiling, not permission to spend |
| `NEXT_PUBLIC_APP_URL` | Optional for production on Vercel; use the exact protected deployment origin when testing a preview |

Leave Stripe and analytics variables unset. Cover letters are included for Free accounts in the v1.0 launch change; existing limits remain one import and two applications. Do not grant Pro or change account permissions without owner approval.

Only public keys/URLs belong in browser variables. Configure production and preview environments deliberately; don't point disposable automation at a populated production database.

## 4. Anthropic and cost approval

Inspect existing Anthropic configuration securely. The source defaults are documented model IDs (see links below); actual account access and structured/streaming requests still need live verification. Check the chosen account has access to both models.

Ask the owner for a concrete spend ceiling before any billable AI request. Do not add credits, billing details or subscriptions automatically. Use made-up fixture resumes first. Uploading the owner's personal resume to Anthropic requires their approval for that data transfer.

`npm run test:live` makes real API requests when a key is present; run it only after cost approval. Without a key it skips, which is not a pass. Mock fixtures were hand-written and do not establish live AI correctness.

## 5. Deploy and configure authentication

After approved changes are on the chosen branch, deploy the inspected project. Record the commit, deployment ID/URL and environment. Confirm the URL is protected before adding personal data.

In Supabase Auth URL Configuration, set Site URL to that exact origin and allow the required callback origin. Prefer the precise testing URL over a broad preview wildcard. The app uses `/auth/callback`. Add localhost callbacks only for a local environment that needs them.

## 6. Acceptance on the actual deployment

Use the workflow matrix in `LAUNCH_STATUS.md`. Verify account creation, sign-in/out, resume upload and extraction (including education), corrections and confirmation, persisted vault, posting analysis, truthful resume and cover-letter generation, Word/PDF downloads, two-account data/file isolation, and desktop plus narrow-phone/foldable usability.

Don't run account-deletion automation on production. Automated unit/RLS/local browser results support the release but do not replace these production checks. Keep release status incomplete while any required workflow is untested or broken.

## Maintenance

- Use reviewed pull requests; don't merge significant changes without owner approval.
- Run `npm ci`, typecheck, lint, unit tests, RLS tests and a production build. Run the full E2E suite with a disposable local Supabase stack and mock AI; run approved live checks separately.
- Run `npm audit` and review security patches. Keep Next and its ESLint config aligned. Don't use forced major upgrades to clear audit output.
- Apply migrations forward; back up existing data first. Never use `db:reset` against a cloud project.
- Monitor Vercel errors and Supabase/Anthropic usage without logging resume text, prompts or credentials. Rotate secrets in the provider/hosting interfaces.

References checked November 10, 2026:
- [Vercel: protecting production on every plan](https://vercel.com/changelog/protect-production-deployments-for-free-on-every-plan). Older documentation still described paid production protection; verify actual account controls.
- [Sonnet model ID](https://platform.claude.com/docs/en/models/sonnet-5-5/overview) and [Haiku model ID](https://platform.claude.com/docs/en/models/haiku-5-5/overview).
