import { describe, expect, it } from "vitest";
import { checkYearsClaim, parseYearsClaim } from "@/lib/vault/summary-claims";

describe("parseYearsClaim", () => {
  it("reads common phrasings", () => {
    expect(parseYearsClaim("8+ years of experience")).toEqual({ years: 8, atLeast: true });
    expect(parseYearsClaim("10 plus years in retail")).toEqual({ years: 10, atLeast: true });
    expect(parseYearsClaim("Over 5 years leading teams")).toEqual({ years: 5, atLeast: true });
    expect(parseYearsClaim("6 years of customer service")).toEqual({ years: 6, atLeast: false });
    expect(parseYearsClaim("Dedicated team player")).toBeNull();
  });
});

const exact = (months: number) => ({ months, maxMonths: months, isMinimum: false });

describe("checkYearsClaim", () => {
  it("accepts a claim the dates support", () => {
    expect(checkYearsClaim("8+ years", exact(127))?.ok).toBe(true);
  });

  it("shows the discrepancy when the dates fall short", () => {
    const result = checkYearsClaim("8+ years of experience", exact(70));
    expect(result?.ok).toBe(false);
    expect(result?.message).toBe(
      "Your resume says 8+ years, but the dates in your work history add up to 5 yrs 10 mos. We'll use the dates unless you fix them.",
    );
  });

  it("allows a plain claim within a year", () => {
    expect(checkYearsClaim("6 years", exact(66))?.ok).toBe(true);
    expect(checkYearsClaim("6 years", exact(40))?.ok).toBe(false);
  });

  it("notes when the dates show more than the claim", () => {
    expect(checkYearsClaim("3 years", exact(100))?.message).toContain("underselling");
  });
});

describe("checkYearsClaim with year-only dates", () => {
  // 2021 to 2024, year-only: at least 3 years 1 month, at most 4 years.
  const approx = { months: 37, maxMonths: 48, isMinimum: true };

  it("accepts a plain claim the generous reading supports", () => {
    expect(checkYearsClaim("4 years", approx)?.ok).toBe(true);
  });

  it("refuses a plain claim no reading of the dates supports", () => {
    expect(checkYearsClaim("20 years", approx)?.ok).toBe(false);
  });

  it("counts \"N+\" claims conservatively", () => {
    expect(checkYearsClaim("4+ years", approx)?.ok).toBe(false);
    expect(checkYearsClaim("3+ years", approx)?.ok).toBe(true);
  });
});
