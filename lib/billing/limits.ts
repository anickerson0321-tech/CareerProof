import type { Plan } from "@/lib/domain";
import { PLAN_LIMITS } from "./plans";

// Plan limits, enforced on the server. Messages offer the way forward; a limit
// is never a dead end.

export type LimitCode = "limit_imports" | "limit_applications" | "limit_cover_letters";

export class PlanLimitError extends Error {
  constructor(
    readonly code: LimitCode,
    message: string,
  ) {
    super(message);
    this.name = "PlanLimitError";
  }
}

export interface UsageSnapshot {
  plan: Plan;
  imports_used: number;
  applications_created: number;
}

export const importLimitError = () =>
  new PlanLimitError(
    "limit_imports",
    "The free plan includes one resume import. Upgrade to Pro to add more resumes, or add facts to your vault yourself.",
  );

export const applicationLimitError = () =>
  new PlanLimitError(
    "limit_applications",
    `The free plan includes ${PLAN_LIMITS.free.applications} applications. Upgrade to Pro for unlimited applications. Your existing applications stay as they are.`,
  );

// Quick checks before any AI work. The database enforces the same limits
// atomically (reserve_import, create_application).
export function assertCanImport(usage: UsageSnapshot) {
  if (usage.imports_used >= PLAN_LIMITS[usage.plan].imports) throw importLimitError();
}

export function assertCanCreateApplication(usage: UsageSnapshot) {
  if (usage.applications_created >= PLAN_LIMITS[usage.plan].applications) throw applicationLimitError();
}

export function assertCanWriteCoverLetter(plan: Plan) {
  if (!PLAN_LIMITS[plan].coverLetters) {
    throw new PlanLimitError(
      "limit_cover_letters",
      "Cover letters are part of Pro. Upgrade to write one for this application from your confirmed facts.",
    );
  }
}
