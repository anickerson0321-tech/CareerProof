import { monthIndex, parseResumeDate, type ParsedDate, type YearMonth } from "./parse";

// Employment intervals are counted in whole months, inclusive of both ends
// (Jun 2019 – Aug 2019 = 3 months), the way people read resume dates.
//
// Year-only dates are counted conservatively so we never overstate experience:
// a year-only start counts from December, a year-only end counts to January.
// Those totals are marked as a minimum ("at least").

export interface DatedJob {
  id: string;
  start_date: string | null;
  end_date: string | null;
  dates_uncertain?: boolean;
}

export interface MonthInterval {
  jobId: string;
  start: number; // month index, inclusive
  end: number; // month index, inclusive
  approximate: boolean;
}

export type IntervalResult =
  | { ok: true; interval: MonthInterval }
  | { ok: false; jobId: string; reason: "missing_start" | "invalid_start" | "invalid_end" | "end_before_start" | "starts_in_future" };

function startIndex(date: ParsedDate, asOf: YearMonth): number | null {
  switch (date.kind) {
    case "month":
      return monthIndex(date);
    case "year":
      return date.year * 12 + 11;
    case "present":
      return monthIndex(asOf);
    case "invalid":
      return null;
  }
}

function endIndex(date: ParsedDate, asOf: YearMonth): number | null {
  switch (date.kind) {
    case "month":
      return monthIndex(date);
    case "year":
      return date.year * 12;
    case "present":
      return monthIndex(asOf);
    case "invalid":
      return null;
  }
}

export function jobInterval(job: DatedJob, asOf: YearMonth): IntervalResult {
  if (!job.start_date || job.start_date.trim() === "") {
    return { ok: false, jobId: job.id, reason: "missing_start" };
  }
  const startParsed = parseResumeDate(job.start_date);
  // A missing end date is treated as unknown, not as "present".
  const endParsed = job.end_date ? parseResumeDate(job.end_date) : ({ kind: "invalid", raw: "" } as const);

  const start = startIndex(startParsed, asOf);
  if (start === null) return { ok: false, jobId: job.id, reason: "invalid_start" };
  const end = endIndex(endParsed, asOf);
  if (end === null) return { ok: false, jobId: job.id, reason: "invalid_end" };

  const nowIndex = monthIndex(asOf);
  if (start > nowIndex) return { ok: false, jobId: job.id, reason: "starts_in_future" };

  const approximate =
    startParsed.kind === "year" || endParsed.kind === "year" || Boolean(job.dates_uncertain);

  if (end < start) {
    // Only possible with month precision on both sides being reversed, or a
    // year-only date making the conservative window collapse (e.g. "2019"–"2019").
    if (startParsed.kind === "year" || endParsed.kind === "year") {
      return { ok: true, interval: { jobId: job.id, start, end: start, approximate: true } };
    }
    return { ok: false, jobId: job.id, reason: "end_before_start" };
  }

  return { ok: true, interval: { jobId: job.id, start, end: Math.min(end, nowIndex), approximate } };
}

/** Total months covered by the intervals, with overlapping months counted once. */
export function mergedMonths(intervals: MonthInterval[]): number {
  if (intervals.length === 0) return 0;
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  let total = 0;
  let curStart = sorted[0]!.start;
  let curEnd = sorted[0]!.end;
  for (const next of sorted.slice(1)) {
    if (next.start <= curEnd + 1) {
      curEnd = Math.max(curEnd, next.end);
    } else {
      total += curEnd - curStart + 1;
      curStart = next.start;
      curEnd = next.end;
    }
  }
  total += curEnd - curStart + 1;
  return total;
}

export interface ExperienceSummary {
  months: number;
  /** True when any counted job has year-only or uncertain dates: the total is a minimum. */
  isMinimum: boolean;
  /** Jobs left out because their dates could not be read. */
  excludedJobIds: string[];
  countedJobIds: string[];
}

export function experienceFor(jobs: DatedJob[], asOf: YearMonth): ExperienceSummary {
  const intervals: MonthInterval[] = [];
  const excluded: string[] = [];
  for (const job of jobs) {
    const result = jobInterval(job, asOf);
    if (result.ok) intervals.push(result.interval);
    else excluded.push(result.jobId);
  }
  return {
    months: mergedMonths(intervals),
    isMinimum: intervals.some((i) => i.approximate),
    excludedJobIds: excluded,
    countedJobIds: intervals.map((i) => i.jobId),
  };
}

/** Duration of a single job in months, or null when its dates can't be read. */
export function jobMonths(job: DatedJob, asOf: YearMonth): number | null {
  const result = jobInterval(job, asOf);
  return result.ok ? result.interval.end - result.interval.start + 1 : null;
}
