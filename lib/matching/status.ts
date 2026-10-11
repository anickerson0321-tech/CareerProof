import type { AiStatus, DerivedStatus, FactStatus, JobStatus, ReqKind } from "@/lib/domain";
import { experienceFor, type DatedJob, type ExperienceSummary } from "@/lib/dates/intervals";
import type { YearMonth } from "@/lib/dates/parse";

// The status a user sees is computed here, in code, from what the AI said plus
// the vault's real state. It is never stored as truth (SPEC §5).

export interface StatusInput {
  ai_status: AiStatus;
  user_gap: boolean;
  answered: boolean;
  years_required: number | null;
}

export interface CitedFact {
  id: string;
  status: FactStatus;
}

export interface RelevantJob extends DatedJob {
  status: JobStatus;
}

export interface YearsCheck {
  requiredMonths: number;
  experience: ExperienceSummary;
  met: boolean;
}

export interface DerivedResult {
  status: DerivedStatus;
  years: YearsCheck | null;
  /** Cited facts that would lift this requirement if the user confirmed them. */
  unconfirmedFactIds: string[];
  /** Relevant jobs that need confirming for a years requirement to count. */
  unconfirmedJobIds: string[];
}

export function deriveStatus(
  req: StatusInput,
  citedFacts: CitedFact[],
  relevantJobs: RelevantJob[],
  asOf: YearMonth,
): DerivedResult {
  // Removed facts are not evidence at all.
  const evidence = citedFacts.filter((f) => f.status !== "unsupported");
  const unconfirmedFactIds = evidence.filter((f) => f.status !== "confirmed").map((f) => f.id);
  const base = { unconfirmedFactIds, unconfirmedJobIds: [] as string[] };

  if (req.user_gap) return { ...base, status: "gap", years: null };

  if (req.years_required !== null && req.years_required > 0 && relevantJobs.length > 0 && !req.answered) {
    const experience = experienceFor(relevantJobs, asOf);
    const requiredMonths = Math.round(req.years_required * 12);
    const met = experience.months >= requiredMonths;
    const counted = new Set(experience.countedJobIds);
    const unconfirmedJobIds = relevantJobs
      .filter((j) => counted.has(j.id) && j.status !== "confirmed")
      .map((j) => j.id);
    const years: YearsCheck = { requiredMonths, experience, met };
    if (met) {
      return { ...base, unconfirmedJobIds, years, status: unconfirmedJobIds.length === 0 ? "strong" : "hidden" };
    }
    return { ...base, unconfirmedJobIds, years, status: experience.months > 0 ? "partial" : "unknown" };
  }

  const confirmedCount = evidence.length - unconfirmedFactIds.length;

  if (req.ai_status === "strong") {
    if (evidence.length === 0) return { ...base, status: "unknown", years: null };
    if (unconfirmedFactIds.length > 0) return { ...base, status: "hidden", years: null };
    return { ...base, status: "strong", years: null };
  }

  if (req.ai_status === "partial") {
    // PLAN §3.9: "Partly supported" must rest on at least one confirmed fact.
    if (evidence.length === 0) return { ...base, status: "unknown", years: null };
    if (confirmedCount === 0) return { ...base, status: "hidden", years: null };
    return { ...base, status: "partial", years: null };
  }

  return { ...base, status: req.ai_status, years: null };
}

export const STATUS_LABELS: Record<DerivedStatus, string> = {
  strong: "Supported",
  partial: "Partly supported",
  hidden: "Needs your OK",
  unknown: "Not in your record yet",
  gap: "You don't have this",
};

/** Display order for segment bars and legends: best first. */
export const STATUS_ORDER: DerivedStatus[] = ["strong", "partial", "hidden", "unknown", "gap"];

export interface ScoreInput {
  kind: ReqKind;
  status: DerivedStatus;
}

export interface Score {
  required: { supported: number; total: number };
  preferred: { supported: number; total: number };
}

/** "Supported" in the score card means fully supported (strong) only. */
export function scoreRequirements(items: ScoreInput[]): Score {
  const tally = (kind: ReqKind) => {
    const ofKind = items.filter((i) => i.kind === kind);
    return { supported: ofKind.filter((i) => i.status === "strong").length, total: ofKind.length };
  };
  return { required: tally("required"), preferred: tally("preferred") };
}
