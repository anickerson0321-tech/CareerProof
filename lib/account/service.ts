import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ApiError } from "@/lib/api/respond";
import { getStripe } from "@/lib/billing/stripe";
import { stripeKeyPresent } from "@/lib/env.server";

const BUCKET = "resumes";

/** Everything the person has stored, as one JSON document (read through RLS as them). */
export async function exportAccountData(userId: string) {
  const supabase = await createClient();
  const [profile, sources, jobs, facts, revisions, applications, requirements, evidence, documents, aiCalls] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, email, phone, location, headline, plan, subscription_status, current_period_end, imports_used, applications_created, created_at")
      .eq("user_id", userId)
      .single(),
    supabase.from("source_documents").select("id, filename, mime_type, extracted_text, extraction_warnings, created_at").order("created_at"),
    supabase.from("jobs").select("id, code, employer, title, location, start_date, end_date, dates_uncertain, status, created_at").order("created_at"),
    supabase
      .from("facts")
      .select("id, code, type, job_id, text, source_passage, source_document_id, origin, explicit, note, status, confirmed_at, answered_requirement_id, created_at")
      .order("created_at"),
    supabase.from("fact_revisions").select("fact_id, previous_text, new_text, created_at").order("created_at"),
    supabase.from("applications").select("id, title, employer, posting_text, posting_url, ignored_note, status, created_at").order("created_at"),
    supabase
      .from("requirements")
      .select("id, application_id, code, text, kind, logic, parts, years_required, ai_status, explanation, question, answered, user_gap, created_at")
      .order("created_at"),
    supabase.from("requirement_evidence").select("requirement_id, fact_id"),
    supabase.from("documents").select("id, application_id, kind, version, page_target, content, created_at").order("created_at"),
    supabase.from("ai_calls").select("task, model, input_tokens, output_tokens, success, error_code, created_at").order("created_at"),
  ]);
  const failed = [profile, sources, jobs, facts, revisions, applications, requirements, evidence, documents, aiCalls].find((r) => r.error);
  if (failed?.error) throw new ApiError(500, "export_failed", "We couldn't gather your data. Please try again.");

  return {
    format: "careerproof-export",
    version: 1,
    exported_at: new Date().toISOString(),
    note: "Your uploaded resume files are not included here; their extracted text is under source_documents.",
    profile: profile.data,
    vault: { jobs: jobs.data, facts: facts.data, fact_revisions: revisions.data, source_documents: sources.data },
    applications: (applications.data ?? []).map((a) => ({
      ...a,
      requirements: (requirements.data ?? [])
        .filter((r) => r.application_id === a.id)
        .map((r) => ({ ...r, evidence_fact_ids: (evidence.data ?? []).filter((e) => e.requirement_id === r.id).map((e) => e.fact_id) })),
      documents: (documents.data ?? []).filter((d) => d.application_id === a.id),
    })),
    ai_usage: aiCalls.data,
  };
}

/**
 * Permanently deletes the account: cancels billing, removes every stored file,
 * then deletes the auth user, which cascades to every table.
 */
export async function deleteAccount(userId: string) {
  const admin = createAdminClient();

  const { data: profile } = await admin.from("profiles").select("stripe_customer_id").eq("user_id", userId).maybeSingle();
  if (profile?.stripe_customer_id) {
    if (!stripeKeyPresent()) {
      throw new ApiError(503, "billing_unavailable", "We couldn't reach billing to cancel your subscription, so nothing was deleted. Please try again later.");
    }
    try {
      // Deleting the customer cancels any subscription immediately.
      await getStripe().customers.del(profile.stripe_customer_id);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== "resource_missing") {
        throw new ApiError(502, "billing_unavailable", "We couldn't cancel your subscription, so nothing was deleted. Please try again in a few minutes.");
      }
    }
  }

  await removeStoredFiles(userId);

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new ApiError(500, "delete_failed", "We couldn't finish deleting your account. Please try again.");
}

async function removeStoredFiles(userId: string) {
  const admin = createAdminClient();
  const storage = admin.storage.from(BUCKET);
  // Files live directly under "<user_id>/". Page through until the folder is empty.
  for (let round = 0; round < 50; round++) {
    const { data: files, error } = await storage.list(userId, { limit: 100 });
    if (error) throw new ApiError(500, "delete_failed", "We couldn't remove your uploaded files, so nothing was deleted. Please try again.");
    const paths = (files ?? []).filter((f) => f.name && f.id).map((f) => `${userId}/${f.name}`);
    if (paths.length === 0) return;
    const { error: removeError } = await storage.remove(paths);
    if (removeError) throw new ApiError(500, "delete_failed", "We couldn't remove your uploaded files, so nothing was deleted. Please try again.");
  }
}
