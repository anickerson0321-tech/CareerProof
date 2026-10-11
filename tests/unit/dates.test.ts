import { describe, expect, it } from "vitest";
import { endDateSortKey, parseResumeDate } from "@/lib/dates/parse";
import { experienceFor, jobInterval, jobMonths, mergedMonths } from "@/lib/dates/intervals";
import { formatDateRange, formatMonths, formatResumeDate } from "@/lib/dates/format";

const asOf = { year: 2026, month: 9 };

describe("parseResumeDate", () => {
  it("reads month, year and present", () => {
    expect(parseResumeDate("2019-06")).toEqual({ kind: "month", year: 2019, month: 6 });
    expect(parseResumeDate("2019-6")).toEqual({ kind: "month", year: 2019, month: 6 });
    expect(parseResumeDate("2019")).toEqual({ kind: "year", year: 2019 });
    expect(parseResumeDate("Present")).toEqual({ kind: "present" });
    expect(parseResumeDate(" present ")).toEqual({ kind: "present" });
  });

  it("rejects invalid dates", () => {
    for (const raw of ["2019-13", "2019-00", "19-06", "June 2019", "", "1850", "2019/06", null, undefined]) {
      expect(parseResumeDate(raw).kind).toBe("invalid");
    }
  });
});

describe("jobInterval", () => {
  it("counts months inclusively", () => {
    expect(jobMonths({ id: "a", start_date: "2019-06", end_date: "2019-08" }, asOf)).toBe(3);
    expect(jobMonths({ id: "a", start_date: "2019-06", end_date: "2019-06" }, asOf)).toBe(1);
  });

  it("treats present as the current month", () => {
    expect(jobMonths({ id: "a", start_date: "2026-01", end_date: "present" }, asOf)).toBe(9);
  });

  it("counts year-only dates conservatively", () => {
    // Dec 2016 .. Jan 2019 = 26 months
    const result = jobInterval({ id: "a", start_date: "2016", end_date: "2019" }, asOf);
    expect(result.ok && result.interval.end - result.interval.start + 1).toBe(26);
    expect(result.ok && result.interval.approximate).toBe(true);
  });

  it("gives a same-year year-only job one month rather than failing", () => {
    expect(jobMonths({ id: "a", start_date: "2019", end_date: "2019" }, asOf)).toBe(1);
  });

  it("flags reversed and unreadable dates", () => {
    expect(jobInterval({ id: "a", start_date: "2020-05", end_date: "2019-01" }, asOf)).toEqual({
      ok: false,
      jobId: "a",
      reason: "end_before_start",
    });
    expect(jobInterval({ id: "a", start_date: "soon", end_date: "2019-01" }, asOf).ok).toBe(false);
    expect(jobInterval({ id: "a", start_date: null, end_date: "2019-01" }, asOf).ok).toBe(false);
    expect(jobInterval({ id: "a", start_date: "2019-01", end_date: null }, asOf).ok).toBe(false);
    expect(jobInterval({ id: "a", start_date: "2027-01", end_date: "present" }, asOf).ok).toBe(false);
  });

  it("does not count past the current month", () => {
    expect(jobMonths({ id: "a", start_date: "2026-01", end_date: "2030-01" }, asOf)).toBe(9);
  });

  it("marks uncertain dates as approximate", () => {
    const r = jobInterval({ id: "a", start_date: "2019-01", end_date: "2019-12", dates_uncertain: true }, asOf);
    expect(r.ok && r.interval.approximate).toBe(true);
  });
});

describe("mergedMonths", () => {
  it("counts overlapping months once", () => {
    // Jordan Rivera: 2016-03..2019-08 and 2019-06..present (as of 2026-09) → 2016-03..2026-09
    const summary = experienceFor(
      [
        { id: "lead", start_date: "2019-06", end_date: "present" },
        { id: "custodian", start_date: "2016-03", end_date: "2019-08" },
      ],
      asOf,
    );
    expect(summary.months).toBe(127);
    expect(formatMonths(summary.months)).toBe("10 yrs 7 mos");
    expect(summary.isMinimum).toBe(false);
  });

  it("adds gaps between jobs separately", () => {
    expect(
      mergedMonths([
        { jobId: "a", start: 0, end: 11, approximate: false },
        { jobId: "b", start: 24, end: 35, approximate: false },
      ]),
    ).toBe(24);
  });

  it("merges adjacent and nested intervals", () => {
    expect(
      mergedMonths([
        { jobId: "a", start: 0, end: 11, approximate: false },
        { jobId: "b", start: 12, end: 23, approximate: false },
        { jobId: "c", start: 3, end: 5, approximate: false },
      ]),
    ).toBe(24);
  });

  it("returns zero for nothing", () => {
    expect(mergedMonths([])).toBe(0);
  });

  it("reports excluded jobs and minimum totals", () => {
    const summary = experienceFor(
      [
        { id: "a", start_date: "2018", end_date: "2020" },
        { id: "b", start_date: "bad", end_date: "present" },
      ],
      asOf,
    );
    expect(summary.excludedJobIds).toEqual(["b"]);
    expect(summary.isMinimum).toBe(true);
    expect(summary.months).toBe(14); // Dec 2018 .. Jan 2020
  });
});

describe("formatting", () => {
  it("formats durations", () => {
    expect(formatMonths(1)).toBe("1 mo");
    expect(formatMonths(12)).toBe("1 yr");
    expect(formatMonths(25)).toBe("2 yrs 1 mo");
    expect(formatMonths(0)).toBe("less than a month");
  });

  it("formats dates", () => {
    expect(formatResumeDate("2019-06")).toBe("Jun 2019");
    expect(formatResumeDate("2019")).toBe("2019");
    expect(formatResumeDate("present")).toBe("Present");
    expect(formatResumeDate(null)).toBe("Date unknown");
    expect(formatDateRange("2016-03", "2019-08")).toBe("Mar 2016 – Aug 2019");
  });

  it("sorts present first and unknown last", () => {
    const keys = ["2019-08", "present", "2021", null].map(endDateSortKey);
    expect(keys[1]).toBeGreaterThan(keys[2]!);
    expect(keys[2]).toBeGreaterThan(keys[0]!);
    expect(keys[3]).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe("year-only start in the current year", () => {
  it("counts the job instead of calling it future-dated", () => {
    const result = jobInterval({ id: "j", start_date: "2026", end_date: "present", dates_uncertain: false }, { year: 2026, month: 10 });
    expect(result.ok).toBe(true);
  });
});
