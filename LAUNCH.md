# Launch checklist

The shortest path from this repo to a live site. Each step is small; do one, then tell Claude "done" and it picks up from there. Total time: about 30 minutes.

Things only you can do are marked **You**. Everything else Claude does once the connectors are linked.

## 1. Supabase (database and sign-in)

1. **You:** sign up at [supabase.com](https://supabase.com) ("Continue with GitHub" is fastest). You don't need to create a project.
2. **You:** in Claude, open **Settings → Connectors**, add **Supabase**, and approve access. Then make sure it's switched on for this chat.
3. **Claude:** creates the `careerproof` project (free plan), loads the database (`supabase/migrations`), and checks the `resumes` storage bucket.
4. **You:** in the Supabase dashboard, open **Project Settings → API Keys** and keep this tab open. You'll copy two keys into Vercel in step 3. Claude tells you which ones.

## 2. Anthropic (the AI)

1. **You:** sign up at [console.anthropic.com](https://console.anthropic.com).
2. **You:** open **Billing** and add credits ($5 is plenty to start; each user is capped at $5 of AI use a month by `AI_MONTHLY_COST_CAP_USD`).
3. **You:** open **API Keys → Create Key**, name it `careerproof`, and copy it. **Don't paste it into a chat.** It goes straight into Vercel in step 3.

## 3. Vercel (the website)

1. **You:** sign up at [vercel.com](https://vercel.com) with **Continue with GitHub**, and allow access to the CareerProof repository.
2. **You:** click **Add New → Project**, then **Import** next to CareerProof.
3. **You:** open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL (Claude gives it to you) |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase `anon` / publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase `service_role` / secret key |
   | `ANTHROPIC_API_KEY` | the key from step 2 |
   | `NEXT_PUBLIC_CONTACT_EMAIL` | the address people should write to |

   Tip: Vercel accepts a pasted block of `NAME=value` lines and splits it for you.
4. **You:** click **Deploy** and wait about 2 minutes. Send Claude the address it gives you (like `careerproof-xyz.vercel.app`).

The site's own address is picked up from Vercel automatically. Stripe can wait (step 5).

## 4. Connect sign-in to your address

**Claude** (or you, if the connector can't): Supabase → **Authentication → URL Configuration**:
- **Site URL:** `https://YOUR-ADDRESS`
- **Redirect URLs:** `https://YOUR-ADDRESS/**` and `http://localhost:3000/**`

Then open your site, sign up with your own email and add a resume. That's the launch test.

## 5. Later (not needed to go live)

- **Your own email sender** before real users arrive: Supabase's built-in one sends only a few emails an hour. See README, Deploying step 4.
- **Payments** (Stripe), when you want to charge for Pro. Until then the upgrade page says upgrades aren't available yet, and everyone uses the free plan. Add the Stripe connector and Claude can create the product, prices and webhook. See README, Deploying step 5.
- **Google sign-in** (optional). See README, Deploying step 3.
- **A custom domain:** Vercel → Project → Settings → Domains. Then repeat step 4 with the new address.
