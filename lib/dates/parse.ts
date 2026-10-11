// Resume dates are stored as text: "YYYY-MM", "YYYY", or "present".
// All date math happens here, in code. The AI never computes durations.

export type ParsedDate =
  | { kind: "month"; year: number; month: number }
  | { kind: "year"; year: number }
  | { kind: "present" }
  | { kind: "invalid"; raw: string };

export interface YearMonth {
  year: number;
  month: number; // 1-12
}

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

export function parseResumeDate(raw: string | null | undefined): ParsedDate {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "") return { kind: "invalid", raw: raw ?? "" };
  if (value === "present" || value === "current" || value === "now") return { kind: "present" };

  const monthMatch = /^(\d{4})-(\d{1,2})$/.exec(value);
  if (monthMatch) {
    const year = Number(monthMatch[1]);
    const month = Number(monthMatch[2]);
    if (validYear(year) && month >= 1 && month <= 12) return { kind: "month", year, month };
    return { kind: "invalid", raw: raw ?? "" };
  }

  const yearMatch = /^(\d{4})$/.exec(value);
  if (yearMatch) {
    const year = Number(yearMatch[1]);
    if (validYear(year)) return { kind: "year", year };
  }
  return { kind: "invalid", raw: raw ?? "" };
}

function validYear(year: number): boolean {
  return Number.isInteger(year) && year >= MIN_YEAR && year <= MAX_YEAR;
}

/** Month index: a single integer per calendar month, so differences are month counts. */
export function monthIndex(ym: YearMonth): number {
  return ym.year * 12 + (ym.month - 1);
}

export function fromMonthIndex(index: number): YearMonth {
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function currentYearMonth(now: Date = new Date()): YearMonth {
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

/** True if a stored date string is in an accepted format. */
export function isValidResumeDate(raw: string | null | undefined): boolean {
  return parseResumeDate(raw).kind !== "invalid";
}

/**
 * Sort key for "most recent first" ordering by end date.
 * Present sorts first; year-only dates sort as the latest month of that year;
 * missing or invalid end dates sort last.
 */
export function endDateSortKey(raw: string | null | undefined): number {
  const parsed = parseResumeDate(raw);
  switch (parsed.kind) {
    case "present":
      return Number.POSITIVE_INFINITY;
    case "month":
      return monthIndex(parsed);
    case "year":
      return parsed.year * 12 + 11;
    case "invalid":
      return Number.NEGATIVE_INFINITY;
  }
}
