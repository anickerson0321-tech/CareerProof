import { describe, expect, it } from "vitest";
import { afterEdit, checkLine, factsMap, type GuardFact, type GuardLine } from "@/lib/guard/truth-guard";
import { extractNumbers, unsupportedNumbers } from "@/lib/guard/numbers";
import { authorityWords } from "@/lib/guard/authority";

const facts: GuardFact[] = [
  { id: "f1", code: "E1", status: "confirmed", text: "Cleaned and disinfected 40 patient rooms per shift." },
  { id: "f2", code: "E2", status: "confirmed", text: "Completed LMS training and helped coworkers access courses." },
  { id: "f3", code: "E3", status: "pending", text: "Used Microsoft Teams for shift updates." },
  { id: "f4", code: "E4", status: "confirmed", text: "Supervised a crew of 6 custodians on night shift." },
  { id: "f5", code: "E5", status: "confirmed", text: "Cut supply costs by 12% over 1,200 orders." },
  { id: "f6", code: "E6", status: "unsupported", text: "Removed fact." },
];
const map = factsMap(facts);
const line = (text: string, fact_ids: string[], over: Partial<GuardLine> = {}): GuardLine => ({
  text,
  fact_ids,
  reviewed: false,
  ai_check: null,
  ...over,
});

describe("numbers", () => {
  it("strips commas and keeps percentages distinct", () => {
    expect(extractNumbers("Handled 1,200 orders, 12% savings, 3.5 hours and 15 percent more")).toEqual([
      { value: 1200, percent: false, raw: "1,200" },
      { value: 12, percent: true, raw: "12%" },
      { value: 3.5, percent: false, raw: "3.5" },
      { value: 15, percent: true, raw: "15 percent" },
    ]);
  });

  it("doesn't read sentence punctuation as decimals or thousands", () => {
    expect(extractNumbers("Served 3, 4 or 5.").map((n) => n.value)).toEqual([3, 4, 5]);
  });

  it("a plain number is satisfied by the same percentage, but not the reverse", () => {
    expect(unsupportedNumbers("12 orders", ["12% savings"])).toEqual([]);
    expect(unsupportedNumbers("6% of staff", ["crew of 6"]).map((n) => n.raw)).toEqual(["6%"]);
  });

  it("matches comma and non-comma forms", () => {
    expect(unsupportedNumbers("Over 1200 orders", ["1,200 orders"])).toEqual([]);
  });
});

describe("authority words", () => {
  it("finds the listed words and their forms", () => {
    expect(
      authorityWords(
        "Led, lead, leading, managed, manages, supervised, directed, administered, oversaw, oversees, headed, owned, spearheaded, chaired",
      ),
    ).toHaveLength(14);
  });

  it("ignores ordinary words", () => {
    expect(authorityWords("Cleaned rooms and helped coworkers with training")).toEqual([]);
  });
});

describe("checkLine", () => {
  it("supports a faithful rewrite", () => {
    const r = checkLine(line("Disinfected 40 patient rooms each shift", ["f1"]), map);
    expect(r).toEqual({ flags: [], badge: "supported", exportable: true });
  });

  it("blocks a line with no citation", () => {
    const r = checkLine(line("Great team player", []), map);
    expect(r.badge).toBe("blocked");
    expect(r.exportable).toBe(false);
    expect(r.flags[0]?.code).toBe("no_citation");
  });

  it("blocks a line citing a fact that isn't the user's", () => {
    const r = checkLine(line("Cleaned rooms", ["someone-elses-fact"]), map);
    expect(r.flags.map((f) => f.code)).toContain("unknown_fact");
    expect(r.exportable).toBe(false);
  });

  it("blocks a line citing an unconfirmed fact, even alongside confirmed ones", () => {
    const r = checkLine(line("Used Microsoft Teams to share updates on 40 rooms", ["f1", "f3"]), map);
    expect(r.flags.map((f) => f.code)).toContain("unconfirmed_fact");
    expect(r.badge).toBe("blocked");
  });

  it("blocks a line citing a removed fact", () => {
    const r = checkLine(line("Something", ["f6"]), map);
    expect(r.flags.map((f) => f.code)).toEqual(["removed_fact"]);
  });

  it("reviewed does not override a hard flag", () => {
    const r = checkLine(line("Used Teams", ["f3"], { reviewed: true }), map);
    expect(r.exportable).toBe(false);
  });

  it("flags a number the facts don't state", () => {
    const r = checkLine(line("Disinfected 45 patient rooms each shift", ["f1"]), map);
    expect(r.badge).toBe("check");
    expect(r.flags[0]).toMatchObject({ level: "soft", code: "new_number" });
    expect(r.flags[0]?.message).toContain('"45"');
  });

  it("flags a new percentage", () => {
    const r = checkLine(line("Cut supply costs by 15% over 1,200 orders", ["f5"]), map);
    expect(r.flags.map((f) => f.code)).toEqual(["new_number"]);
  });

  it("accepts comma numbers and percentages that match", () => {
    const r = checkLine(line("Reduced supply costs 12% across 1200 orders", ["f5"]), map);
    expect(r.badge).toBe("supported");
  });

  it("flags authority the facts don't claim (the demo's inflated LMS line)", () => {
    const r = checkLine(line("Managed LMS training compliance for the department", ["f2"]), map);
    expect(r.flags.map((f) => f.code)).toEqual(["authority"]);
    expect(r.badge).toBe("check");
    expect(r.exportable).toBe(false);
  });

  it("allows authority words when a cited fact has one", () => {
    const r = checkLine(line("Led a crew of 6 custodians overnight", ["f4"]), map);
    expect(r.badge).toBe("supported");
  });

  it("includes the AI fact-check issue", () => {
    const r = checkLine(
      line("Disinfected 40 patient rooms each shift", ["f1"], { ai_check: { ok: false, issue: "Says each shift; fact says per shift." } }),
      map,
    );
    expect(r.flags).toEqual([{ level: "soft", code: "ai_check", message: "Says each shift; fact says per shift." }]);
  });

  it("reviewed by you overrides soft flags", () => {
    const r = checkLine(line("Managed LMS training compliance", ["f2"], { reviewed: true }), map);
    expect(r).toMatchObject({ badge: "reviewed", exportable: true });
  });

  it("skills lines only get citation checks", () => {
    const r = checkLine(line("Managed 99 things", ["f1"]), map, { softChecks: false });
    expect(r.badge).toBe("supported");
  });

  it("editing clears review and the AI check", () => {
    const edited = afterEdit(
      line("Managed LMS training compliance", ["f2"], { reviewed: true, ai_check: { ok: false, issue: "x" } }),
      "Completed LMS training and helped coworkers access courses",
    );
    expect(edited.reviewed).toBe(false);
    expect(edited.ai_check).toBeNull();
    expect(checkLine(edited, map).badge).toBe("supported");
  });
});

describe("authority backed only by what the person did", () => {
  const facts = new Map([
    ["m1", { id: "m1", code: "E1", status: "confirmed" as const, text: "Completed LMS training and helped coworkers access courses assigned by the manager." }],
    ["m2", { id: "m2", code: "E2", status: "confirmed" as const, text: "Followed the supervisor's directions for floor care." }],
    ["m3", { id: "m3", code: "E3", status: "confirmed" as const, text: "Supervised two part-time custodians on weekends." }],
  ]);
  const bullet = (text: string, ids: string[]) => ({ id: "b", text, fact_ids: ids, requirement_codes: [], relevance: 2 as const, included: true, reviewed: false, ai_check: null });

  it("a fact that mentions a manager doesn't back \"Managed…\"", () => {
    expect(checkLine(bullet("Managed LMS training compliance", ["m1"]), facts).flags.map((f) => f.code)).toEqual(["authority"]);
    expect(checkLine(bullet("Directed floor care", ["m2"]), facts).flags.map((f) => f.code)).toEqual(["authority"]);
  });

  it("a fact where the person supervised does back it", () => {
    expect(checkLine(bullet("Supervised weekend custodians", ["m3"]), facts).flags).toEqual([]);
  });

  it("ordinary words that look similar aren't claims", () => {
    expect(authorityWords("Cleaned chairs and gave direct patient support")).toEqual([]);
  });
});
