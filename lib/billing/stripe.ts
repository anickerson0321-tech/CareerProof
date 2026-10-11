import "server-only";
import Stripe from "stripe";

let client: Stripe | null = null;

/** Stripe client from STRIPE_SECRET_KEY. Throws a clear error when it isn't set. */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY (see .env.example).");
  client ??= new Stripe(key, { maxNetworkRetries: 2, appInfo: { name: "CareerProof" } });
  return client;
}
