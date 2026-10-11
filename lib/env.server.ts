import "server-only";
import { z } from "zod";

// Server-only secrets. Each group is validated when first used, so a page that
// doesn't need Stripe doesn't fail because Stripe isn't configured yet.

const supabaseAdminSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export function supabaseAdminEnv() {
  return parse(supabaseAdminSchema, "Supabase service role");
}

const stripeSchema = z.object({
  STRIPE_SECRET_KEY: z.string().startsWith("sk_"),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
  STRIPE_PRICE_PRO_MONTHLY: z.string().startsWith("price_"),
  STRIPE_PRICE_PRO_YEARLY: z.string().startsWith("price_"),
});

export function stripeEnv() {
  return parse(stripeSchema, "Stripe");
}

/** True when a Stripe secret key is set (deletion can then cancel billing). */
export function stripeKeyPresent() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

function parse<T extends z.ZodType>(schema: T, label: string): z.infer<T> {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const names = result.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`${label} is not configured. Missing or invalid: ${names}. See .env.example.`);
  }
  return result.data;
}
