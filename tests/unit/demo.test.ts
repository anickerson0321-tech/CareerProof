import { describe, expect, it } from "vitest";
import { DEMO_AS_OF, demoFacts, demoJobs, demoRequirements, demoResume } from "@/lib/demo/data";
import { buildRequirementViews, selectQuestions } from "@/lib/matching/view";
import { scoreRequirements } from "@/lib/matching/status";
import { checkLine, factsMap } from "@/lib/guard/truth-guard";
import { resumeContentSchema } from "@/lib/render/model";

const views = buildRequirementViews(demoRequirements, demoFacts, demoJobs, DEMO_AS_OF);

describe("demo data", () => {
  it("shows every status type", () => {
    expect(new Set(views.map((v) => v.status))).toEqual(new Set(["strong", "partial", "hidden", "unknown", "gap"]));
  });

  it("computes the years requirement from merged dates", () => {
    const r1 = views.find((v) => v.req.code === "R1");
    expect(r1?.status).toBe("strong");
    expect(r1?.yearsText).toBe(
      "Lead Custodian + Custodian: 10 yrs 7 mos of relevant experience, overlapping months counted once. This asks for 3.",
    );
  });

  it("holds Teams back until E12 is confirmed", () => {
    const r5 = views.find((v) => v.req.code === "R5");
    expect(r5?.status).toBe("hidden");
    expect(r5?.unconfirmedFacts.map((f) => f.code)).toEqual(["E12"]);
  });

  it("asks exactly two questions, required first", () => {
    expect(selectQuestions(views).map((v) => v.req.code)).toEqual(["R3", "R6"]);
  });

  it("scores 3 of 6 required and 1 of 3 preferred", () => {
    expect(scoreRequirements(views.map((v) => ({ kind: v.req.kind, status: v.status })))).toEqual({
      required: { supported: 3, total: 6 },
      preferred: { supported: 1, total: 3 },
    });
  });

  it("has a valid resume document", () => {
    expect(resumeContentSchema.safeParse(demoResume).success).toBe(true);
  });

  it("flags only the inflated LMS bullet", () => {
    const facts = factsMap(demoFacts.map((f) => ({ id: f.id, code: f.code, status: f.status, text: f.text })));
    const results = demoResume.jobs.flatMap((j) => j.bullets).map((b) => ({ id: b.id, result: checkLine(b, facts) }));
    const flagged = results.filter((r) => r.result.badge !== "supported");
    expect(flagged.map((r) => r.id)).toEqual(["b2"]);
    expect(flagged[0]?.result.flags.map((f) => f.code)).toEqual(["authority", "ai_check"]);
    expect(demoResume.summary && checkLine(demoResume.summary, facts).badge).toBe("supported");
  });
});
