import { connection, NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { billingChangeFor, HANDLED_EVENTS } from "@/lib/billing/webhook";
import { applyBillingChange } from "@/lib/billing/sync";

const handled = new Set<string>(HANDLED_EVENTS);

// Stripe → us. The signature is checked against the raw body before anything
// is trusted, and each event id is recorded so a retried delivery is a no-op.
export async function POST(request: NextRequest) {
  await connection();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = await Stripe.webhooks.constructEventAsync(body, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (!handled.has(event.type)) return NextResponse.json({ received: true, ignored: true });

  const admin = createAdminClient();
  const { data: seen } = await admin.from("stripe_events").select("id").eq("id", event.id).maybeSingle();
  if (seen) return NextResponse.json({ received: true, duplicate: true });

  const change = billingChangeFor(event);
  if (change) {
    try {
      const matched = await applyBillingChange(change);
      // No matching profile (for example the account was deleted): nothing to update.
      if (!matched) console.warn("Stripe event for unknown customer", event.type);
    } catch {
      // Let Stripe retry.
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }
  }

  await admin.from("stripe_events").upsert({ id: event.id, type: event.type }, { onConflict: "id", ignoreDuplicates: true });
  return NextResponse.json({ received: true });
}
