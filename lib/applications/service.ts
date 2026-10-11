import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runStructured } from "@/lib/ai/run";
import { analysisRequest, postProcessAnalysis } from "@/lib/ai/tasks/analyze-posting";
import { answerRequest, postProcessAnswer } from "@/lib/ai/tasks/answer-to-fact";
import { assertCanCreateApplication } from "@/lib/billing/limits";
import { ApiError, notFound } from "@/lib/api/respond";
import { currentYearMonth } from "@/lib/dates/parse";
import { normalizeText } from "@/lib/vault/normalize";
import type { Fact, Job, Requirement } from "@/lib/domain";
import type { Json } from "@/lib/supabase/database.types";

const FACT_COLUMNS = "id, code, type, job_id, text, source_passage, origin, status, note, source_document_id";
const JOB_COLUMNS = "id, code, employer, title, location, start_date, end_date, dates_uncertain, status";

export async function loadVaultForMatching() {
  const supabase = await createClient();
  const [jobs, facts] = await Promise.all([
    supabase.from("jobs").select(JOB_COLUMNS),
    supabase.from("facts").select(FACT_COLUMNS).neq("status", "unsupported"),
  ]);
  return { jobs: (jobs.data ?? []) as Job[], facts: (facts.data ?? []) as Fact[] };
}

export async function createApplication(
  userId: string,
  input: { postingText: string; postingUrl: string | null },
  signal?: AbortSignal,
): Promise<string> {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, imports_used, applications_created")
    .eq("user_id", userId)
    .single();
  if (!profile) throw new ApiError(500, "no_profile", "Your account isn't fully set up. Sign out and back in, then try again.");
  assertCanCreateApplication(profile);

  const { jobs, facts } = await loadVaultForMatching();
  if (facts.length === 0) {
    throw new ApiError(409, "empty_vault", "Your vault is empty. Add your resume first so we have something to compare.");
  }

  const asOf = currentYearMonth();
  const raw = await runStructured(userId, analysisRequest(input.postingText, jobs, facts, asOf, signal));
  const analysis = postProcessAnalysis(raw, jobs, facts, asOf);
  if (analysis.requirements.length === 0) {
    throw new ApiError(422, "no_requirements", "We couldn't find any job requirements in that text. Check that you pasted the full job posting.");
  }

  const { data: id, error } = await supabase.rpc("create_application", {
    p_title: analysis.title,
    p_employer: analysis.employer,
    p_posting_text: input.postingText,
    // The SQL function accepts null; generated types can't express that.
    p_posting_url: input.postingUrl as string,
    p_ignored_note: analysis.ignored,
    p_requirements: analysis.requirements as unknown as Json,
  });
  if (error || !id) throw new ApiError(500, "save_failed", "We compared the job but couldn't save it. Please try again.");

  await createAdminClient().rpc("record_application", { p_user: userId });
  return id;
}

export async function loadApplication(id: string) {
  const supabase = await createClient();
  const [app, reqs, evidence, vault] = await Promise.all([
    supabase
      .from("applications")
      .select("id, title, employer, posting_text, posting_url, ignored_note, status, created_at")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("requirements")
      .select(
        "id, code, text, kind, logic, parts, ai_status, explanation, question, years_required, relevant_job_ids, user_gap, answered, position",
      )
      .eq("application_id", id)
      .order("position"),
    supabase.from("requirement_evidence").select("requirement_id, fact_id, requirements!inner(application_id)").eq("requirements.application_id", id),
    loadVaultForMatching(),
  ]);
  if (!app.data) return null;
  const evidenceByReq = new Map<string, string[]>();
  for (const row of evidence.data ?? []) {
    evidenceByReq.set(row.requirement_id, [...(evidenceByReq.get(row.requirement_id) ?? []), row.fact_id]);
  }
  const requirements: Requirement[] = (reqs.data ?? []).map((r) => ({
    ...r,
    years_required: r.years_required === null ? null : Number(r.years_required),
    evidence_fact_ids: evidenceByReq.get(r.id) ?? [],
  }));
  return { application: app.data, requirements, ...vault };
}

export interface AnswerOutcome {
  kind: "fact" | "gap";
  fact?: { id: string; code: string; text: string };
  usedOwnWords?: boolean;
}

export async function answerQuestion(
  userId: string,
  applicationId: string,
  requirementId: string,
  answer: string,
): Promise<AnswerOutcome> {
  const supabase = await createClient();
  const { data: req } = await supabase
    .from("requirements")
    .select("id, text, question, application_id")
    .eq("id", requirementId)
    .eq("application_id", applicationId)
    .maybeSingle();
  if (!req) throw notFound("That question");
  if (!req.question) throw new ApiError(409, "no_question", "This requirement doesn't have a question to answer.");

  const { data: evidence } = await supabase
    .from("requirement_evidence")
    .select("facts(code, text, status)")
    .eq("requirement_id", requirementId);
  const relatedFacts = (evidence ?? [])
    .map((e) => e.facts)
    .filter((f): f is { code: string; text: string; status: "confirmed" | "pending" | "unsupported" } => !!f && f.status !== "unsupported")
    .map((f) => ({ code: f.code, text: f.text }));

  const raw = await runStructured(userId, answerRequest({ requirement: req.text, question: req.question, answer, relatedFacts }));
  const result = postProcessAnswer(raw, answer);

  if (!result.has) {
    await supabase.from("requirements").update({ user_gap: true }).eq("id", requirementId);
    return { kind: "gap" };
  }

  // Saved to the vault as an unconfirmed fact; the person confirms it ("Looks right").
  const { data: fact, error } = await supabase
    .from("facts")
    .insert({
      user_id: userId,
      type: "answer",
      text: result.statement,
      normalized_text: normalizeText(result.statement),
      origin: "answer",
      status: "pending",
      note: null,
      answered_requirement_id: requirementId,
    })
    .select("id, code, text")
    .single();
  if (error || !fact) throw new ApiError(500, "save_failed", "We couldn't save your answer. Please try again.");

  await supabase.from("requirement_evidence").insert({ requirement_id: requirementId, fact_id: fact.id, user_id: userId });
  await supabase
    .from("requirements")
    .update({ ai_status: result.status, explanation: result.explanation || undefined, answered: true, user_gap: false })
    .eq("id", requirementId);

  return { kind: "fact", fact, usedOwnWords: result.usedOwnWords };
}

export async function setGap(applicationId: string, requirementId: string, gap: boolean) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("requirements")
    .update({ user_gap: gap })
    .eq("id", requirementId)
    .eq("application_id", applicationId)
    .select("id")
    .maybeSingle();
  if (error) throw new ApiError(500, "save_failed", "We couldn't save that. Please try again.");
  if (!data) throw notFound("That requirement");
}
