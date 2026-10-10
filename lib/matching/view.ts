import type { DerivedStatus, Fact, Job, Requirement } from "@/lib/domain";
import type { YearMonth } from "@/lib/dates/parse";
import { formatMonths } from "@/lib/dates/format";
import { deriveStatus, type YearsCheck } from "./status";

export const MAX_QUESTIONS = 4;

export interface RequirementView {
  req: Requirement;
  status: DerivedStatus;
  /** Cited facts that still exist (removed facts are dropped). */
  evidence: Fact[];
  /** Cited facts that would lift this requirement once confirmed. */
  unconfirmedFacts: Fact[];
  unconfirmedJobs: Job[];
  years: YearsCheck | null;
  yearsText: string | null;
}

export function buildRequirementViews(
  requirements: Requirement[],
  facts: Fact[],
  jobs: Job[],
  asOf: YearMonth,
): RequirementView[] {
  const factsById = new Map(facts.map((f) => [f.id, f]));
  const jobsById = new Map(jobs.map((j) => [j.id, j]));

  return [...requirements]
    .sort((a, b) => a.position - b.position)
    .map((req) => {
      const evidence = req.evidence_fact_ids
        .map((id) => factsById.get(id))
        .filter((f): f is Fact => f !== undefined && f.status !== "unsupported");
      const relevantJobs = req.relevant_job_ids
        .map((id) => jobsById.get(id))
        .filter((j): j is Job => j !== undefined);

      const result = deriveStatus(req, evidence, relevantJobs, asOf);
      return {
        req,
        status: result.status,
        evidence,
        unconfirmedFacts: result.unconfirmedFactIds.map((id) => factsById.get(id)).filter((f): f is Fact => !!f),
        unconfirmedJobs: result.unconfirmedJobIds.map((id) => jobsById.get(id)).filter((j): j is Job => !!j),
        years: result.years,
        yearsText: result.years ? describeYears(result.years, relevantJobs, req.years_required ?? 0) : null,
      };
    });
}

/**
 * "Lead Custodian + Custodian: 10 yrs 7 mos of relevant experience, overlapping
 * months counted once. This asks for 3."
 */
export function describeYears(years: YearsCheck, relevantJobs: Job[], required: number): string {
  const counted = new Set(years.experience.countedJobIds);
  const countedJobs = relevantJobs.filter((j) => counted.has(j.id));
  const excluded = relevantJobs.filter((j) => years.experience.excludedJobIds.includes(j.id));
  const titles = countedJobs.map((j) => j.title || j.employer).join(" + ");
  const amount = `${years.experience.isMinimum ? "at least " : ""}${formatMonths(years.experience.months)}`;
  const overlap = countedJobs.length > 1 ? ", overlapping months counted once" : "";
  const asks = `This asks for ${formatYears(required)}.`;
  const parts = [`${titles || "Your jobs"}: ${amount} of relevant experience${overlap}. ${asks}`];
  if (excluded.length > 0) {
    parts.push(
      `${excluded.map((j) => j.title || j.employer).join(", ")} ${excluded.length === 1 ? "isn't" : "aren't"} counted because the dates couldn't be read.`,
    );
  }
  return parts.join(" ");
}

function formatYears(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

/**
 * The questions to show: only where an answer could help, required first,
 * never more than four.
 */
export function selectQuestions(views: RequirementView[]): RequirementView[] {
  const open = views.filter(
    (v) => v.req.question && !v.req.answered && !v.req.user_gap && v.status !== "strong" && v.status !== "gap",
  );
  const required = open.filter((v) => v.req.kind === "required");
  const preferred = open.filter((v) => v.req.kind === "preferred");
  return [...required, ...preferred].slice(0, MAX_QUESTIONS);
}
