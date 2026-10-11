import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

export interface SessionUser {
  id: string;
  email: string | null;
}

/** The signed-in user, verified, or null. */
export async function getUser(): Promise<SessionUser | null> {
  // Auth is per request and the Supabase client reads the clock, so wait for a
  // real request instead of running during prerender or prefetch.
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const email = typeof data.claims.email === "string" ? data.claims.email : null;
  return { id: data.claims.sub, email };
}

/** For pages: the signed-in user, or a redirect to sign in. */
export async function requireUser(nextPath: string): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return user;
}

/**
 * Where a signed-in user should land: onboarding until their vault has
 * anything in it, then their applications.
 */
export async function homePathFor(userId: string): Promise<string> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("facts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .neq("status", "unsupported");
  return (count ?? 0) > 0 ? "/vault" : "/onboarding";
}
