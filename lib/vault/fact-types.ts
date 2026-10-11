import type { FactType } from "@/lib/domain";

/** Types a person can pick when adding a fact themselves ("answer" comes only from questions). */
export const MANUAL_FACT_TYPES = [
  "duty",
  "accomplishment",
  "skill",
  "education",
  "certification",
  "training",
  "summary_claim",
  "other",
] as const satisfies readonly FactType[];

export const FACT_TYPE_LABELS: Record<FactType, string> = {
  duty: "Duty",
  accomplishment: "Accomplishment",
  skill: "Skill",
  education: "Education",
  certification: "Certification or license",
  training: "Training",
  summary_claim: "Summary claim",
  answer: "From your answer",
  other: "Other",
};

/** Plain hints shown under the type picker. */
export const FACT_TYPE_HINTS: Partial<Record<FactType, string>> = {
  duty: "Something you did regularly in a job.",
  accomplishment: "A result or achievement, ideally with a number.",
  education: "Include whether it's completed, in progress (with expected date), or unfinished.",
  certification: "A certificate or license you hold.",
  training: "A course or training you completed.",
};
