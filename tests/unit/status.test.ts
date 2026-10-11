import { describe, expect, it } from "vitest";
import { deriveStatus, scoreRequirements, type StatusInput } from "@/lib/matching/status";

const asOf = { year: 2026, month: 9 };
const req = (over: Partial<StatusInput> = {}): StatusInput => ({
  ai_status: "strong",
  user_gap: false,
  answered: false,
  years_required: null,
  ...over,
});
const confirmed = (id: string) => ({ id, status: "confirmed" as const });
const pending = (id: string) => ({ id, status: "pending" as const });

describe("deriveStatus", () => {
  it("user gap wins over everything", () => {
    expect(deriveStatus(req({ user_gap: true }), [confirmed("a")], [], asOf).status).toBe("gap");
  });

  it("strong with confirmed evidence stays strong", () => {
    expect(deriveStatus(req(), [confirmed("a"), confirmed("b")], [], asOf).status).toBe("strong");
  });

  it("strong with no cited facts is unknown", () => {
    expect(deriveStatus(req(), [], [], asOf).status).toBe("unknown");
  });

  it("strong with any unconfirmed fact needs the user's OK", () => {
    const r = deriveStatus(req(), [confirmed("a"), pending("b")], [], asOf);
    expect(r.status).toBe("hidden");
    expect(r.unconfirmedFactIds).toEqual(["b"]);
  });

  it("removed facts don't count as evidence", () => {
    expect(deriveStatus(req(), [{ id: "a", status: "unsupported" }], [], asOf).status).toBe("unknown");
  });

  it("partial needs at least one confirmed fact", () => {
    expect(deriveStatus(req({ ai_status: "partial" }), [confirmed("a")], [], asOf).status).toBe("partial");
    expect(deriveStatus(req({ ai_status: "partial" }), [pending("a")], [], asOf).status).toBe("hidden");
    expect(deriveStatus(req({ ai_status: "partial" }), [], [], asOf).status).toBe("unknown");
  });

  it("passes hidden and unknown through", () => {
    expect(deriveStatus(req({ ai_status: "hidden" }), [], [], asOf).status).toBe("hidden");
    expect(deriveStatus(req({ ai_status: "unknown" }), [], [], asOf).status).toBe("unknown");
  });

  describe("years required", () => {
    const jobs = [
      { id: "lead", start_date: "2019-06", end_date: "present", status: "confirmed" as const },
      { id: "cust", start_date: "2016-03", end_date: "2019-08", status: "confirmed" as const },
    ];

    it("is strong when merged months meet the requirement and jobs are confirmed", () => {
      const r = deriveStatus(req({ ai_status: "partial", years_required: 3 }), [], jobs, asOf);
      expect(r.status).toBe("strong");
      expect(r.years?.experience.months).toBe(127);
      expect(r.years?.requiredMonths).toBe(36);
    });

    it("needs the user's OK when a counted job is pending", () => {
      const r = deriveStatus(
        req({ years_required: 3 }),
        [],
        [jobs[0]!, { ...jobs[1]!, status: "pending" as const }],
        asOf,
      );
      expect(r.status).toBe("hidden");
      expect(r.unconfirmedJobIds).toEqual(["cust"]);
    });

    it("is partial when some but not enough experience", () => {
      expect(deriveStatus(req({ years_required: 12 }), [], jobs, asOf).status).toBe("partial");
    });

    it("is unknown when no months can be counted", () => {
      const bad = [{ id: "x", start_date: "??", end_date: "present", status: "confirmed" as const }];
      expect(deriveStatus(req({ years_required: 2 }), [], bad, asOf).status).toBe("unknown");
    });

    it("overlapping jobs are not double counted", () => {
      // 2019-06..2026-09 = 88 months merged, not 88 + 40.
      const overlapping = [
        { id: "a", start_date: "2019-06", end_date: "present", status: "confirmed" as const },
        { id: "b", start_date: "2019-06", end_date: "2022-09", status: "confirmed" as const },
      ];
      expect(deriveStatus(req({ years_required: 8 }), [], overlapping, asOf).status).toBe("partial");
    });

    it("an answered requirement uses the AI's re-judged status instead", () => {
      const r = deriveStatus(req({ years_required: 12, answered: true }), [confirmed("a")], jobs, asOf);
      expect(r.status).toBe("strong");
      expect(r.years).toBeNull();
    });

    it("without relevant jobs falls back to the evidence rules", () => {
      expect(deriveStatus(req({ years_required: 3 }), [confirmed("a")], [], asOf).status).toBe("strong");
    });
  });
});

describe("scoreRequirements", () => {
  it("counts only fully supported items", () => {
    const score = scoreRequirements([
      { kind: "required", status: "strong" },
      { kind: "required", status: "partial" },
      { kind: "required", status: "hidden" },
      { kind: "preferred", status: "strong" },
      { kind: "preferred", status: "gap" },
    ]);
    expect(score).toEqual({ required: { supported: 1, total: 3 }, preferred: { supported: 1, total: 2 } });
  });
});
