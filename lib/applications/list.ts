import "server-only";
import { createClient } from "@/lib/supabase/server";
import { currentYearMonth } from "@/lib/dates/parse";
import { buildRequirementViews } from "@/lib/matching/view";
import { scoreRequirements } from "@/lib/matching/status";
import type { AppStatus, DerivedStatus, ReqKind, Requirement } from "@/lib/domain";
import { loadVaultForMatching } from "./service";

export interface ApplicationSummary {
  id: string;
  title: string;
  employer: string;
  status: AppStatus;
  created_at: string;
  required: { supported: number; total: number };
  segments: { code: string; text: string; kind: ReqKind; status: DerivedStatus }[];
}

/** Every application with its live score (statuses derived from today's vault). */
export async function listApplications(): Promise<{ applications: ApplicationSummary[]; waiting: number }> {
  const supabase = await createClient();
  const [apps, reqs, evidence, vault] = await Promise.all([
    supabase.from("applications").select("id, title, employer, status, created_at").order("created_at", { ascending: false }),
    supabase
      .from("requirements")
      .select(
        "id, application_id, code, text, kind, logic, parts, ai_status, explanation, question, years_required, relevant_job_ids, user_gap, answered, position",
      ),
    supabase.from("requirement_evidence").select("requirement_id, fact_id"),
    loadVaultForMatching(),
  ]);

  const evidenceByReq = new Map<string, string[]>();
  for (const row of evidence.data ?? []) {
    evidenceByReq.set(row.requirement_id, [...(evidenceByReq.get(row.requirement_id) ?? []), row.fact_id]);
  }
  const asOf = currentYearMonth();

  const applications = (apps.data ?? []).map((app) => {
    const requirements: Requirement[] = (reqs.data ?? [])
      .filter((r) => r.application_id === app.id)
      .map(({ application_id: _unused, ...r }) => ({
        ...r,
        years_required: r.years_required === null ? null : Number(r.years_required),
        evidence_fact_ids: evidenceByReq.get(r.id) ?? [],
      }));
    const views = buildRequirementViews(requirements, vault.facts, vault.jobs, asOf);
    const score = scoreRequirements(views.map((v) => ({ kind: v.req.kind, status: v.status })));
    return {
      ...app,
      required: score.required,
      segments: views.map((v) => ({ code: v.req.code, text: v.req.text, kind: v.req.kind, status: v.status })),
    };
  });

  const waiting =
    vault.facts.filter((f) => f.status === "pending").length + vault.jobs.filter((j) => j.status === "pending").length;
  return { applications, waiting };
}
