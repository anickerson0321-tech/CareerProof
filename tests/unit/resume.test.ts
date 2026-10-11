import { describe, expect, it } from "vitest";
import { generationRequest, generationSchema, postProcessGeneration } from "@/lib/ai/tasks/generate-resume";
import { applyFactCheck, factCheckRequest, factCheckSchema, linesToCheck } from "@/lib/ai/tasks/fact-check";
import { checkLine, factsMap } from "@/lib/guard/truth-guard";
import { applyOp, OpError } from "@/lib/resume/ops";
import { linesNeedingLook } from "@/components/resume/resume-preview";
import type { Fact } from "@/lib/domain";
import type { ResumeContent } from "@/lib/render/model";
import { deniseAfterAnswer } from "../support/fixture-application";
import { readFixture } from "../support/fixture-vault";

const asOf = { year: 2026, month: 10 };
const { input, vault } = deniseAfterAnswer(asOf);
const guardOf = (facts: Fact[]) => factsMap(facts.map((f) => ({ id: f.id, code: f.code, status: f.status, text: f.text })));

function generate(): ResumeContent {
  const request = generationRequest(input);
  const raw = generationSchema.parse(JSON.parse(readFixture("ai", "generate_resume", `${request.fixtureKey}.json`)));
  const content = postProcessGeneration(raw, input);
  const lines = linesToCheck(content, new Map(vault.facts.map((f) => [f.id, { code: f.code, text: f.text }])));
  const check = factCheckSchema.parse(JSON.parse(readFixture("ai", "fact_check", `${factCheckRequest(lines).fixtureKey}.json`)));
  return applyFactCheck(content, lines, check);
}

const content = generate();
const bullets = content.jobs.flatMap((j) => j.bullets);
const byId = (id: string) => bullets.find((b) => b.id === id)!;
const guard = guardOf(vault.facts);

describe("generation request", () => {
  it("sends confirmed facts only, with statuses from code and no AI-chosen dates", () => {
    const pending = { ...input, facts: input.facts.map((f) => (f.code === "E25" ? { ...f, status: "pending" as const } : f)) };
    const prompt = generationRequest(pending).prompt;
    expect(prompt).not.toContain("E25");
    expect(prompt).toContain("R5 (required, Partly supported)");
    expect(prompt).toContain("j1: Lead Custodian at Kettering Valley Hospital (Mar 2020 – Present)");
    expect(prompt).toContain("E1: the dates support this");
  });

  it("tells the AI when the dates don't support a summary claim", () => {
    const short = { ...input, jobs: input.jobs.slice(0, 1) };
    expect(generationRequest(short).prompt).toContain("E1: the dates DON'T support this");
  });
});

describe("generation post-processing", () => {
  it("every bullet cites only confirmed facts that belong to the person", () => {
    const confirmed = new Set(vault.facts.filter((f) => f.status === "confirmed").map((f) => f.id));
    for (const b of bullets) {
      expect(b.fact_ids.length).toBeGreaterThan(0);
      for (const id of b.fact_ids) expect(confirmed.has(id)).toBe(true);
    }
  });

  it("keeps the vault's job order and puts the most relevant bullets first", () => {
    expect(content.jobs.map((j) => j.job_id)).toEqual(["job-1", "job-2", "job-3"]);
    const relevance = content.jobs[0]!.bullets.map((b) => b.relevance);
    expect(relevance).toEqual([...relevance].sort((a, b) => b - a));
    expect(bullets.map((b) => b.id)).toEqual(["b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8", "b9", "b10"]);
  });

  it("drops skills that don't cite a skill fact", () => {
    expect(content.skills.map((s) => s.text)).not.toContain("Microsoft Outlook");
    expect(content.skills).toHaveLength(6);
  });

  it("drops citations to unconfirmed facts", () => {
    const pendingAnswer = { ...input, facts: input.facts.map((f) => (f.code === "E26" ? { ...f, status: "pending" as const } : f)) };
    const raw = generationSchema.parse(JSON.parse(readFixture("ai", "generate_resume", `${generationRequest(input).fixtureKey}.json`)));
    const result = postProcessGeneration(raw, pendingAnswer);
    const b2 = result.jobs[0]!.bullets.find((b) => b.text.startsWith("Build the weekly schedule"))!;
    expect(b2.fact_ids).toEqual(["fact-3"]);
  });

  it("drops bullets under unknown or unconfirmed jobs and keeps uncited bullets visible but blocked", () => {
    const result = postProcessGeneration(
      {
        summary: { text: "", evidence: [] },
        jobs: [
          { job: "j9", bullets: [{ text: "Ghost job", evidence: ["E3"], requirements: [], relevance: 3 }] },
          { job: "J1", bullets: [{ text: "• Unsupported claim", evidence: ["E999"], requirements: ["R99", "r2"], relevance: 7 }] },
        ],
        skills: [],
      },
      input,
    );
    expect(result.summary).toBeNull();
    expect(result.jobs).toHaveLength(1);
    const b = result.jobs[0]!.bullets[0]!;
    expect(b).toMatchObject({ text: "Unsupported claim", fact_ids: [], requirement_codes: ["R2"], relevance: 3 });
    expect(checkLine(b, guard).badge).toBe("blocked");
  });
});

describe("Truth Guard on the generated resume", () => {
  it("flags the inflated number and the made-up authority", () => {
    expect(checkLine(byId("b4"), guard).flags.map((f) => f.code)).toEqual(["new_number", "ai_check"]);
    expect(checkLine(byId("b6"), guard).flags.map((f) => f.code)).toEqual(["authority", "ai_check"]);
    expect(byId("b4").ai_check?.issue).toBe("The cited fact says you trained 9 new hires, not 12.");
  });

  it("passes everything else, including the summary", () => {
    for (const b of bullets.filter((x) => !["b4", "b6"].includes(x.id))) {
      expect(checkLine(b, guard).badge, b.text).toBe("supported");
    }
    expect(checkLine(content.summary!, guard).badge).toBe("supported");
    expect(linesNeedingLook(content, guard)).toBe(2);
  });
});

describe("document operations", () => {
  it("editing a flagged line clears the old check and re-runs code checks", () => {
    const next = applyOp(content, { op: "edit", bulletId: "b4", text: "Trained 9 new hires on chemical safety, PPE and isolation-room cleaning." }, guard);
    const b4 = next.jobs[0]!.bullets.find((b) => b.id === "b4")!;
    expect(b4.ai_check).toBeNull();
    expect(checkLine(b4, guard).badge).toBe("supported");
    expect(linesNeedingLook(next, guard)).toBe(1);
  });

  it("'It's accurate' makes a soft-flagged line exportable", () => {
    const next = applyOp(content, { op: "review", bulletId: "b6" }, guard);
    const b6 = next.jobs[0]!.bullets.find((b) => b.id === "b6")!;
    expect(checkLine(b6, guard)).toMatchObject({ badge: "reviewed", exportable: true });
  });

  it("'It's accurate' is refused on a line that relies on an unconfirmed fact", () => {
    const pendingGuard = guardOf(vault.facts.map((f) => (f.code === "E26" ? { ...f, status: "pending" as const } : f)));
    expect(() => applyOp(content, { op: "review", bulletId: "b2" }, pendingGuard)).toThrow(OpError);
  });

  it("editing after a review clears the review", () => {
    const reviewed = applyOp(content, { op: "review", bulletId: "b6" }, guard);
    const edited = applyOp(reviewed, { op: "edit", bulletId: "b6", text: "Managed supply ordering for the night shift." }, guard);
    const b6 = edited.jobs[0]!.bullets.find((b) => b.id === "b6")!;
    expect(b6.reviewed).toBe(false);
    expect(checkLine(b6, guard).badge).toBe("check");
  });

  it("unchecking a line excludes it without touching the vault fact", () => {
    const next = applyOp(content, { op: "include", bulletId: "b4", included: false }, guard);
    expect(next.jobs[0]!.bullets.find((b) => b.id === "b4")!.included).toBe(false);
    expect(linesNeedingLook(next, guard)).toBe(1);
    expect(vault.facts.find((f) => f.code === "E5")!.text).toContain("9 new hires");
  });

  it("excludes several lines at once and toggles skills", () => {
    const next = applyOp(applyOp(content, { op: "exclude-many", bulletIds: ["b9", "b10"] }, guard), { op: "skill-include", index: 0, included: false }, guard);
    expect(next.jobs.flatMap((j) => j.bullets).filter((b) => !b.included).map((b) => b.id)).toEqual(["b9", "b10"]);
    expect(next.skills[0]!.included).toBe(false);
  });

  it("summary edits clear the summary's checks", () => {
    const next = applyOp(content, { op: "summary-edit", text: "Custodial lead who trains new staff." }, guard);
    expect(next.summary).toMatchObject({ text: "Custodial lead who trains new staff.", ai_check: null, reviewed: false });
  });

  it("unknown lines are an error, not a silent no-op", () => {
    expect(() => applyOp(content, { op: "include", bulletId: "nope", included: false }, guard)).toThrow(OpError);
  });
});
