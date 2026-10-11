import type Stripe from "stripe";
import type { Plan } from "@/lib/domain";

// Turns Stripe events into profile changes. Pure, so it's unit-tested with
// signed sample events; the route does the database work.

export const HANDLED_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
] as const;

/** Statuses that keep Pro. past_due keeps access while Stripe retries the card. */
const PRO_STATUSES = new Set(["active", "trialing", "past_due"]);

export interface BillingPatch {
  plan: Plan;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  subscription_status: string;
  current_period_end?: string | null;
}

export interface BillingChange {
  /** Checkout grants Pro at once; subscription events are the source of truth after that. */
  source: "checkout" | "subscription";
  /** How to find the person: our user id (from checkout or subscription metadata), else the Stripe customer. */
  userId: string | null;
  customerId: string;
  patch: BillingPatch;
  /** Event time; older events than the last applied one are ignored. */
  at: string;
}

const id = (value: string | { id: string } | null | undefined) => (typeof value === "string" ? value : (value?.id ?? null));

export function planForStatus(status: string): Plan {
  return PRO_STATUSES.has(status) ? "pro" : "free";
}

function periodEnd(sub: Stripe.Subscription): string | null {
  const ends = sub.items.data.map((item) => item.current_period_end).filter((n): n is number => typeof n === "number");
  return ends.length ? new Date(Math.max(...ends) * 1000).toISOString() : null;
}

export function billingChangeFor(event: Stripe.Event): BillingChange | null {
  const at = new Date(event.created * 1000).toISOString();
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const customerId = id(session.customer);
      if (session.mode !== "subscription" || !customerId) return null;
      if (session.payment_status === "unpaid") return null;
      return {
        source: "checkout",
        userId: session.client_reference_id ?? null,
        customerId,
        at,
        patch: { plan: "pro", stripe_customer_id: customerId, stripe_subscription_id: id(session.subscription), subscription_status: "active" },
      };
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const customerId = id(sub.customer);
      if (!customerId) return null;
      const status = event.type === "customer.subscription.deleted" ? "canceled" : sub.status;
      return {
        source: "subscription",
        userId: sub.metadata?.user_id || null,
        customerId,
        at,
        patch: {
          plan: planForStatus(status),
          stripe_customer_id: customerId,
          stripe_subscription_id: sub.id,
          subscription_status: status === "active" && sub.cancel_at_period_end ? "canceling" : status,
          current_period_end: periodEnd(sub),
        },
      };
    }
    default:
      return null;
  }
}
