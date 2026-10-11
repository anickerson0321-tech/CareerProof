import { formatMonths } from "@/lib/dates/format";

// Core rule 9: a summary claim like "8+ years" is checked against the dates in
// the vault. If they disagree we show the difference instead of picking the
// bigger number.

export interface YearsClaim {
  years: number;
  atLeast: boolean;
}

const CLAIM_PATTERN = /(\d{1,2}(?:\.\d)?)\s*(\+|plus)?\s*(?:years?|yrs?)\b/i;
const OVER_PATTERN = /\b(?:over|more than|at least)\s+(\d{1,2}(?:\.\d)?)\s*(?:years?|yrs?)\b/i;

export function parseYearsClaim(text: string): YearsClaim | null {
  const over = OVER_PATTERN.exec(text);
  if (over) return { years: Number(over[1]), atLeast: true };
  const match = CLAIM_PATTERN.exec(text);
  if (!match) return null;
  return { years: Number(match[1]), atLeast: Boolean(match[2]) };
}

export interface ClaimCheck {
  claim: YearsClaim;
  ok: boolean;
  message: string | null;
}

/**
 * "8+ years" is fine when the dates show 8 or more. A plain "8 years" is fine
 * within a year either way. When some dates are year-only, a plain claim is
 * also fine if the most generous reading of those dates could reach it.
 * Otherwise explain the difference in plain words.
 */
export function checkYearsClaim(
  text: string,
  experience: { months: number; maxMonths: number; isMinimum: boolean },
): ClaimCheck | null {
  const claim = parseYearsClaim(text);
  if (!claim) return null;
  const { months: recordedMonths, maxMonths, isMinimum } = experience;
  const claimedMonths = Math.round(claim.years * 12);
  const ok = claim.atLeast
    ? recordedMonths >= claimedMonths
    : Math.abs(recordedMonths - claimedMonths) < 12 || (isMinimum && claimedMonths > recordedMonths && claimedMonths < maxMonths + 12);
  if (ok) return { claim, ok, message: null };
  const recorded = `${isMinimum ? "at least " : ""}${formatMonths(recordedMonths)}`;
  const claimed = `${claim.years}${claim.atLeast ? "+" : ""} years`;
  return {
    claim,
    ok,
    message:
      recordedMonths < claimedMonths
        ? `Your resume says ${claimed}, but the dates in your work history add up to ${recorded}. We'll use the dates unless you fix them.`
        : `Your resume says ${claimed}, but the dates in your work history add up to ${recorded}. You may be underselling yourself.`,
  };
}
