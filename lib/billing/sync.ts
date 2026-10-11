import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BillingChange } from "./webhook";

/**
 * Applies a billing change to the person's profile (service role). Returns
 * false when no profile matched. Changes older than the last applied one are
 * skipped, so out-of-order webhook deliveries can't undo newer state.
 */
export async function applyBillingChange(change: BillingChange): Promise<boolean> {
  const admin = createAdminClient();
  const query = admin.from("profiles").select("user_id, billing_event_at, stripe_subscription_id");
  const { data: profile } = change.userId
    ? await query.eq("user_id", change.userId).maybeSingle()
    : await query.eq("stripe_customer_id", change.customerId).maybeSingle();
  if (!profile) return false;

  if (change.source === "checkout") {
    // Subscription events for this subscription already set the real state.
    if (profile.billing_event_at && profile.stripe_subscription_id === change.patch.stripe_subscription_id) return true;
  } else if (profile.billing_event_at && new Date(profile.billing_event_at) > new Date(change.at)) {
    return true;
  }

  const update = change.source === "checkout" ? change.patch : { ...change.patch, billing_event_at: change.at };
  const { error } = await admin.from("profiles").update(update).eq("user_id", profile.user_id);
  if (error) throw new Error(`Profile billing update failed: ${error.code}`);
  return true;
}
