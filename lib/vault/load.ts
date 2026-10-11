import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Fact, Job } from "@/lib/domain";

/** Everything the vault screen needs, read as the signed-in user (RLS). */
export async function loadVault(userId: string) {
  const supabase = await createClient();
  const [profile, jobs, facts] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, email, phone, location, headline, plan, imports_used, applications_created")
      .eq("user_id", userId)
      .single(),
    supabase
      .from("jobs")
      .select("id, code, employer, title, location, start_date, end_date, dates_uncertain, status")
      .order("created_at"),
    supabase
      .from("facts")
      .select("id, code, type, job_id, text, source_passage, origin, status, note, source_document_id")
      .neq("status", "unsupported")
      .order("created_at"),
  ]);
  if (profile.error || !profile.data) throw new Error("Couldn't load your profile.");
  return {
    profile: profile.data,
    jobs: (jobs.data ?? []) as Job[],
    // Codes sort naturally: E2 before E10.
    facts: ((facts.data ?? []) as Fact[]).sort((a, b) => codeNumber(a.code) - codeNumber(b.code)),
  };
}

function codeNumber(code: string) {
  return Number(code.replace(/\D/g, "")) || 0;
}
