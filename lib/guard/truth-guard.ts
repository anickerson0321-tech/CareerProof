import type { FactStatus } from "@/lib/domain";
import { authorityWords, backsAuthority } from "./authority";
import { unsupportedNumbers } from "./numbers";
import { checkYearsClaim } from "@/lib/vault/summary-claims";

// Truth Guard: code checks every generated line against the facts it cites.
// Shared by the browser preview and the server export, which re-runs it.

export interface GuardFact {
  id: string;
  code: string;
  status: FactStatus;
  text: string;
}

export interface AiCheck {
  ok: boolean;
  issue: string | null;
}

export interface GuardLine {
  text: string;
  fact_ids: string[];
  reviewed: boolean;
  ai_check: AiCheck | null;
}

export type FlagCode =
  | "no_citation"
  | "unknown_fact"
  | "removed_fact"
  | "unconfirmed_fact"
  | "new_number"
  | "authority"
  | "years_claim"
  | "ai_check";

export interface GuardFlag {
  level: "hard" | "soft";
  code: FlagCode;
  /** Plain-language reason shown under the line. */
  message: string;
}

export type GuardBadge = "supported" | "check" | "blocked" | "reviewed";

export interface GuardResult {
  flags: GuardFlag[];
  badge: GuardBadge;
  exportable: boolean;
}

export const BADGE_LABELS: Record<GuardBadge, string> = {
  supported: "Supported",
  check: "Check this",
  blocked: "Can't be used",
  reviewed: "Reviewed by you",
};

export interface GuardOptions {
  /** Skills lines only get the citation checks, not the wording checks. */
  softChecks?: boolean;
  /**
   * Summary only: experience from the confirmed jobs' dates. A years claim
   * ("8+ years") the dates don't support gets a soft flag (core rule 9).
   */
  experience?: { months: number; maxMonths: number; isMinimum: boolean };
}

/**
 * `factsById` must contain only the current user's facts. A cited id that
 * isn't in it is treated as not theirs.
 */
export function checkLine(
  line: GuardLine,
  factsById: ReadonlyMap<string, GuardFact>,
  options: GuardOptions = {},
): GuardResult {
  const softChecks = options.softChecks ?? true;
  const flags: GuardFlag[] = [];
  const ids = [...new Set(line.fact_ids)];

  if (ids.length === 0) {
    flags.push({ level: "hard", code: "no_citation", message: "This line doesn't point to any fact in your vault." });
  }

  const cited: GuardFact[] = [];
  for (const id of ids) {
    const fact = factsById.get(id);
    if (!fact) {
      flags.push({ level: "hard", code: "unknown_fact", message: "This line points to a fact that isn't in your vault." });
      continue;
    }
    if (fact.status === "unsupported") {
      flags.push({ level: "hard", code: "removed_fact", message: `${fact.code} was removed from your vault.` });
      continue;
    }
    if (fact.status !== "confirmed") {
      flags.push({
        level: "hard",
        code: "unconfirmed_fact",
        message: `${fact.code} isn't confirmed yet. Confirm it in your vault to use this line.`,
      });
    }
    cited.push(fact);
  }

  if (softChecks && cited.length > 0) {
    const sources = cited.map((f) => f.text);

    const numbers = unsupportedNumbers(line.text, sources);
    if (numbers.length > 0) {
      const list = numbers.map((n) => `"${n.raw}"`).join(", ");
      flags.push({
        level: "soft",
        code: "new_number",
        message: `${list} ${numbers.length === 1 ? "isn't" : "aren't"} in the facts this line is based on.`,
      });
    }

    const words = authorityWords(line.text);
    if (words.length > 0 && !sources.some(backsAuthority)) {
      flags.push({
        level: "soft",
        code: "authority",
        message: `"${words[0]}" suggests you were in charge, but the facts behind this line don't say that.`,
      });
    }

    if (options.experience) {
      const years = checkYearsClaim(line.text, options.experience);
      if (years && !years.ok && years.message) flags.push({ level: "soft", code: "years_claim", message: years.message });
    }

    if (line.ai_check && !line.ai_check.ok) {
      flags.push({
        level: "soft",
        code: "ai_check",
        message: line.ai_check.issue?.trim() || "The fact-check found something the cited facts don't say.",
      });
    }
  }

  const hard = flags.some((f) => f.level === "hard");
  const soft = flags.some((f) => f.level === "soft");
  const exportable = !hard && (!soft || line.reviewed);
  const badge: GuardBadge = hard ? "blocked" : soft ? (line.reviewed ? "reviewed" : "check") : "supported";
  return { flags, badge, exportable };
}

/** Editing a line clears the user's review and the old AI check (SPEC §8). */
export function afterEdit<T extends GuardLine>(line: T, text: string): T {
  return { ...line, text, reviewed: false, ai_check: null };
}

export function factsMap(facts: GuardFact[]): Map<string, GuardFact> {
  return new Map(facts.map((f) => [f.id, f]));
}
