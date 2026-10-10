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

describe("checkYearsClaim", () => {
  it("accepts a claim the dates support", () => {
    expect(checkYearsClaim("8+ years", 127, false)?.ok).toBe(true);
  });

  it("shows the discrepancy when the dates fall short", () => {
    const result = checkYearsClaim("8+ years of experience", 70, false);
    expect(result?.ok).toBe(false);
    expect(result?.message).toBe(
      "Your resume says 8+ years, but the dates in your work history add up to 5 yrs 10 mos. We'll use the dates unless you fix them.",
    );
  });

  it("allows a plain claim within a year", () => {
    expect(checkYearsClaim("6 years", 66, false)?.ok).toBe(true);
    expect(checkYearsClaim("6 years", 40, false)?.ok).toBe(false);
  });

  it("notes when the dates show more than the claim", () => {
    expect(checkYearsClaim("3 years", 100, false)?.message).toContain("underselling");
  });
});
