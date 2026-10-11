import "server-only";
import { ApiError } from "@/lib/api/respond";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env";
import { stripeKeyPresent } from "@/lib/env.server";
import { getStripe } from "./stripe";
import { billingChangeFor } from "./webhook";
import { applyBillingChange } from "./sync";
import type Stripe from "stripe";

export type BillingInterval = "monthly" | "yearly";

export function billingConfigured() {
  return stripeKeyPresent() && Boolean(process.env.STRIPE_PRICE_PRO_MONTHLY && process.env.STRIPE_PRICE_PRO_YEARLY);
}

function requireBilling() {
  if (!billingConfigured()) {
    throw new ApiError(503, "billing_unavailable", "Upgrades aren't available on this copy of CareerProof yet.");
  }
}

const appUrl = (path: string) => new URL(path, publicEnv().NEXT_PUBLIC_APP_URL).toString();

async function customerFor(user: { id: string; email: string | null }) {
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("plan, stripe_customer_id, full_name")
    .eq("user_id", user.id)
    .single();
  if (!profile) throw new ApiError(500, "no_profile", "Your account isn't fully set up. Sign out and back in, then try again.");
  if (profile.stripe_customer_id) return { profile, customerId: profile.stripe_customer_id };

  const customer = await getStripe().customers.create(
    { email: user.email ?? undefined, name: profile.full_name ?? undefined, metadata: { user_id: user.id } },
    { idempotencyKey: `customer-${user.id}` },
  );
  await admin.from("profiles").update({ stripe_customer_id: customer.id }).eq("user_id", user.id);
  return { profile, customerId: customer.id };
}

/** A Stripe Checkout page for Pro. */
export async function createCheckout(user: { id: string; email: string | null }, interval: BillingInterval): Promise<string> {
  requireBilling();
  const { profile, customerId } = await customerFor(user);
  if (profile.plan === "pro") {
    throw new ApiError(409, "already_pro", "You already have Pro. Manage your plan from Settings.");
  }
  const price = interval === "yearly" ? process.env.STRIPE_PRICE_PRO_YEARLY! : process.env.STRIPE_PRICE_PRO_MONTHLY!;
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price, quantity: 1 }],
    subscription_data: { metadata: { user_id: user.id } },
    allow_promotion_codes: true,
    success_url: appUrl("/upgrade/success?session_id={CHECKOUT_SESSION_ID}"),
    cancel_url: appUrl("/upgrade?cancelled=1"),
  });
  if (!session.url) throw new ApiError(502, "checkout_failed", "We couldn't open checkout. Please try again.");
  return session.url;
}

/** Stripe's Customer Portal: change plan, update card, cancel. */
export async function createPortal(userId: string): Promise<string> {
  requireBilling();
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("stripe_customer_id").eq("user_id", userId).single();
  if (!profile?.stripe_customer_id) throw new ApiError(400, "no_billing", "There's no billing account yet. Upgrade to Pro first.");
  const session = await getStripe().billingPortal.sessions.create({ customer: profile.stripe_customer_id, return_url: appUrl("/settings#plan") });
  return session.url;
}

/**
 * After checkout, confirm the payment with Stripe directly so Pro starts right
 * away, even if the webhook hasn't arrived yet.
 */
export async function confirmCheckout(userId: string, sessionId: string): Promise<boolean> {
  if (!billingConfigured() || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return false;
  const session = await getStripe().checkout.sessions.retrieve(sessionId);
  if (session.client_reference_id !== userId) return false;
  const change = billingChangeFor({
    id: `confirm_${session.id}`,
    type: "checkout.session.completed",
    created: Math.floor(Date.now() / 1000),
    data: { object: session },
  } as unknown as Stripe.Event);
  if (!change) return false;
  return applyBillingChange(change);
}
