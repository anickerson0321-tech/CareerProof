import { parseResumeDate } from "./parse";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 127 → "10 yrs 7 mos". */
export function formatMonths(total: number): string {
  if (total <= 0) return "less than a month";
  const years = Math.floor(total / 12);
  const months = total % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? "yr" : "yrs"}`);
  if (months > 0) parts.push(`${months} ${months === 1 ? "mo" : "mos"}`);
  return parts.join(" ");
}

/** Spoken-friendly version for screen readers: "10 years 7 months". */
export function formatMonthsLong(total: number): string {
  if (total <= 0) return "less than a month";
  const years = Math.floor(total / 12);
  const months = total % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? "year" : "years"}`);
  if (months > 0) parts.push(`${months} ${months === 1 ? "month" : "months"}`);
  return parts.join(" ");
}

/** "2019-06" → "Jun 2019", "2019" → "2019", "present" → "Present". */
export function formatResumeDate(raw: string | null | undefined): string {
  const parsed = parseResumeDate(raw);
  switch (parsed.kind) {
    case "month":
      return `${MONTHS[parsed.month - 1]} ${parsed.year}`;
    case "year":
      return String(parsed.year);
    case "present":
      return "Present";
    case "invalid":
      return raw && raw.trim() !== "" ? raw : "Date unknown";
  }
}

export function formatDateRange(start: string | null, end: string | null): string {
  return `${formatResumeDate(start)} – ${formatResumeDate(end)}`;
}
