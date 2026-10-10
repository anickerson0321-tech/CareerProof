// Shared domain vocabulary. These mirror the Postgres enums in supabase/migrations.

export const FACT_TYPES = [
  "duty",
  "accomplishment",
  "skill",
  "education",
  "certification",
  "training",
  "summary_claim",
  "answer",
  "other",
] as const;
export type FactType = (typeof FACT_TYPES)[number];

export const FACT_ORIGINS = ["resume", "answer", "manual"] as const;
export type FactOrigin = (typeof FACT_ORIGINS)[number];

// "unsupported" = removed by the user. Kept as a tombstone so a re-import
// does not bring it back; never shown, never citable.
export const FACT_STATUSES = ["confirmed", "pending", "unsupported"] as const;
export type FactStatus = (typeof FACT_STATUSES)[number];

export const JOB_STATUSES = ["confirmed", "pending"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const APP_STATUSES = ["draft", "applied", "interviewing", "offer", "closed"] as const;
export type AppStatus = (typeof APP_STATUSES)[number];

export const REQ_KINDS = ["required", "preferred"] as const;
export type ReqKind = (typeof REQ_KINDS)[number];

export const REQ_LOGICS = ["all", "any"] as const;
export type ReqLogic = (typeof REQ_LOGICS)[number];

// What the AI said. Never "gap": only the user can declare a gap.
export const AI_STATUSES = ["strong", "partial", "hidden", "unknown"] as const;
export type AiStatus = (typeof AI_STATUSES)[number];

// What the user sees, computed in code by lib/matching/status.ts.
export type DerivedStatus = AiStatus | "gap";

export const PAGE_TARGETS = ["strict_one", "one_if_possible", "up_to_two"] as const;
export type PageTarget = (typeof PAGE_TARGETS)[number];

export const PLANS = ["free", "pro"] as const;
export type Plan = (typeof PLANS)[number];

export interface Job {
  id: string;
  code: string;
  employer: string;
  title: string;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  dates_uncertain: boolean;
  status: JobStatus;
}

export interface Fact {
  id: string;
  code: string;
  type: FactType;
  job_id: string | null;
  text: string;
  source_passage: string | null;
  origin: FactOrigin;
  status: FactStatus;
  note: string | null;
}

export interface Requirement {
  id: string;
  code: string;
  text: string;
  kind: ReqKind;
  logic: ReqLogic;
  parts: string[];
  ai_status: AiStatus;
  explanation: string;
  question: string | null;
  years_required: number | null;
  relevant_job_ids: string[];
  user_gap: boolean;
  answered: boolean;
  position: number;
  evidence_fact_ids: string[];
}
