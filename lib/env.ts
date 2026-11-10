import { z } from "zod";

// Public values are inlined into the browser bundle at build time, so they must
// be read as literal `process.env.NEXT_PUBLIC_*` expressions.
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
});

export type PublicEnv = z.infer<typeof publicSchema>;

let cachedPublic: PublicEnv | null = null;

/**
 * The public Supabase key. Supabase calls it the "anon" key in older projects
 * and the "publishable" key in newer ones; the Vercel integration may set
 * either, so accept both.
 */
export function supabasePublicKey(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || undefined;
}

/**
 * The site's own address, for links in emails, Stripe redirects, the sitemap
 * and social previews. NEXT_PUBLIC_APP_URL wins; on Vercel it falls back to
 * the project's production domain, so it doesn't have to be set by hand.
 */
export function appUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit;
  const vercel = process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

export function publicEnv(): PublicEnv {
  if (cachedPublic) return cachedPublic;
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabasePublicKey(),
    NEXT_PUBLIC_APP_URL: appUrl(),
  });
  if (!parsed.success) {
    throw new Error(
      `Missing or invalid public environment variables: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}. See .env.example.`,
    );
  }
  cachedPublic = parsed.data;
  return cachedPublic;
}

/** Contact address shown on the Contact, Privacy and Terms pages. */
export function contactEmail(): string | null {
  const value = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();
  return value ? value : null;
}
