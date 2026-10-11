import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runStructured } from "@/lib/ai/run";
import { extractionRequest, postProcessExtraction } from "@/lib/ai/tasks/extract-resume";
import { assertCanImport, importLimitError } from "@/lib/billing/limits";
import { MAX_RESUME_CHARS } from "@/lib/extract/detect";
import { ApiError, notFound } from "@/lib/api/respond";
import type { ExtractionWarning } from "@/lib/extract/detect";
import type { Json } from "@/lib/supabase/database.types";
import { planMerge, profileUpdates } from "./merge";

export interface ImportSummary {
  newJobs: number;
  newFacts: number;
  alreadyInVault: number;
  previouslyRemoved: number;
  warnings: string[];
  sourceDocumentId: string;
}

export async function importResume(userId: string, sourceDocumentId: string, signal?: AbortSignal): Promise<ImportSummary> {
  const supabase = await createClient();

  const [{ data: doc }, { data: profile }] = await Promise.all([
    supabase.from("source_documents").select("id, extracted_text, extraction_warnings").eq("id", sourceDocumentId).maybeSingle(),
    supabase
      .from("profiles")
      .select("plan, imports_used, applications_created, full_name, email, phone, location, headline")
      .eq("user_id", userId)
      .single(),
  ]);
  if (!doc) throw notFound("That resume");
  if (!profile) throw new ApiError(500, "no_profile", "Your account isn't fully set up. Sign out and back in, then try again.");

  const stored = (doc.extraction_warnings ?? []) as unknown as ExtractionWarning[];
  if (stored.some((w) => w.blocking) || !doc.extracted_text.trim()) {
    throw new ApiError(422, "unreadable", "We couldn't read enough text from this resume. Upload a different file or paste the text.");
  }

  if (doc.extracted_text.length > MAX_RESUME_CHARS) {
    throw new ApiError(422, "too_long", "This resume is longer than we can read at once. Upload a shorter version.");
  }
  assertCanImport(profile);

  // Count the import before the AI runs (checked and counted in one database
  // statement), and give it back if anything fails.
  const admin = createAdminClient();
  const { data: reserved } = await admin.rpc("reserve_import", { p_user: userId });
  if (!reserved) throw importLimitError();
  try {
    return await runImport(userId, sourceDocumentId, doc, stored, profile, signal);
  } catch (error) {
    await admin.rpc("release_import", { p_user: userId });
    throw error;
  }
}

async function runImport(
  userId: string,
  sourceDocumentId: string,
  doc: { extracted_text: string },
  stored: ExtractionWarning[],
  profile: Parameters<typeof profileUpdates>[0],
  signal?: AbortSignal,
): Promise<ImportSummary> {
  const supabase = await createClient();
  const raw = await runStructured(userId, extractionRequest(doc.extracted_text, signal));
  const extraction = postProcessExtraction(raw);

  const [{ data: jobs }, { data: facts }, { data: revisions }] = await Promise.all([
    supabase.from("jobs").select("id, employer, title, status, previous_identities"),
    supabase.from("facts").select("id, normalized_text, status, job_id"),
    supabase.from("fact_revisions").select("fact_id, previous_text"),
  ]);
  const plan = planMerge(extraction, jobs ?? [], facts ?? [], revisions ?? []);

  const factRows = plan.newFacts.map((f) => {
    const matched = f.jobKey ? plan.matchedJobs[f.jobKey] : undefined;
    const jobRef = matched
      ? matched.startsWith("new:")
        ? { job_key: matched.slice(4) }
        : { job_id: matched }
      : f.jobKey && plan.newJobs.some((j) => j.key === f.jobKey)
        ? { job_key: f.jobKey }
        : {};
    return {
      type: f.type,
      text: f.text,
      normalized_text: f.normalized_text,
      source_passage: f.source_passage,
      note: f.note,
      ...jobRef,
    };
  });

  const { error: insertError } = await supabase.rpc("import_vault_items", {
    p_source_document_id: sourceDocumentId,
    p_jobs: plan.newJobs as unknown as Json,
    p_facts: factRows as unknown as Json,
  });
  if (insertError) throw new ApiError(500, "save_failed", "We read your resume but couldn't save it. Please try again.");

  const updates = profileUpdates(profile, extraction.profile);
  if (Object.keys(updates).length > 0) {
    await supabase.from("profiles").update(updates).eq("user_id", userId);
  }

  const aiWarnings = extraction.warnings.map((message) => ({ code: "ai_note", blocking: false, message }));
  if (aiWarnings.length > 0) {
    await supabase
      .from("source_documents")
      .update({ extraction_warnings: [...stored, ...aiWarnings] as never })
      .eq("id", sourceDocumentId);
  }

  return {
    newJobs: plan.newJobs.length,
    newFacts: plan.newFacts.length,
    alreadyInVault: plan.alreadyInVault,
    previouslyRemoved: plan.previouslyRemoved,
    warnings: extraction.warnings,
    sourceDocumentId,
  };
}
