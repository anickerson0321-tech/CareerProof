import { describe, expect, it } from "vitest";
import {
  analysisRequest,
  analysisSchema,
  formatRecord,
  isBoilerplate,
  postProcessAnalysis,
  type Analysis,
} from "@/lib/ai/tasks/analyze-posting";
import { answerRequest, answerSchema, postProcessAnswer } from "@/lib/ai/tasks/answer-to-fact";
import { buildRequirementViews, selectQuestions } from "@/lib/matching/view";
import type { Fact, Job, Requirement } from "@/lib/domain";
import { postingText, readFixture, vaultFromResume, withAnswer } from "../support/fixture-vault";

const asOf = { year: 2026, month: 10 };

function analyze(posting: string, vault: { jobs: Job[]; facts: Fact[] }) {
  const request = analysisRequest(posting, vault.jobs, vault.facts, asOf);
  const raw = analysisSchema.parse(JSON.parse(readFixture("ai", "analyze_posting", `${request.fixtureKey}.json`)));
  const clean = postProcessAnalysis(raw, vault.jobs, vault.facts, asOf);
  const requirements: Requirement[] = clean.requirements.map((r) => ({ ...r, id: r.code, user_gap: false, answered: false }));
  const views = buildRequirementViews(requirements, vault.facts, vault.jobs, asOf);
  return { request, raw, clean, views };
}

const BOILERPLATE_WORDS = /salary|\$\d|benefit|equal opportunity|401|403|pto|paid time off|apply|stipend|schedule:|differential/i;

describe.each([
  ["evs-supervisor", "custodial-lead"],
  ["instructional-designer", "career-changer"],
  ["junior-developer", "new-grad"],
])("%s × %s", (posting, resume) => {
  const vault = vaultFromResume(resume);
  const { clean, views, raw } = analyze(postingText(posting), vault);

  it("never turns boilerplate into a requirement", () => {
    for (const r of clean.requirements) expect(r.text, r.text).not.toMatch(BOILERPLATE_WORDS);
    expect(clean.ignored.length).toBeGreaterThan(0);
  });

  it("returns 6 to 12 requirements, required first, coded R1…", () => {
    expect(clean.requirements.length).toBeGreaterThanOrEqual(6);
    expect(clean.requirements.length).toBeLessThanOrEqual(12);
    const kinds = clean.requirements.map((r) => r.kind);
    expect(kinds).toEqual([...kinds].sort((a, b) => (a === b ? 0 : a === "required" ? -1 : 1)));
    expect(clean.requirements.map((r) => r.code)).toEqual(clean.requirements.map((_, i) => `R${i + 1}`));
  });

  it("only cites this person's facts and jobs", () => {
    const factIds = new Set(vault.facts.map((f) => f.id));
    const jobIds = new Set(vault.jobs.map((j) => j.id));
    for (const r of clean.requirements) {
      for (const id of r.evidence_fact_ids) expect(factIds.has(id)).toBe(true);
      for (const id of r.relevant_job_ids) expect(jobIds.has(id)).toBe(true);
    }
    expect(raw.requirements.length).toBeGreaterThanOrEqual(clean.requirements.length);
  });

  it("asks at most 4 questions, required first, never on supported items", () => {
    const questions = selectQuestions(views);
    expect(questions.length).toBeLessThanOrEqual(4);
    for (const q of questions) expect(q.status).not.toBe("strong");
    const kinds = questions.map((q) => q.req.kind);
    expect(kinds).toEqual([...kinds].sort((a, b) => (a === b ? 0 : a === "required" ? -1 : 1)));
  });

  it("never repeats what the vault already says in a question", () => {
    for (const q of selectQuestions(views)) {
      // A question may quote the record, but must ask for something new.
      expect(q.req.question).toMatch(/\?/);
      for (const f of vault.facts) expect(q.req.question).not.toBe(f.text);
    }
  });
});

describe("evs supervisor × custodial lead", () => {
  const vault = vaultFromResume("custodial-lead");
  const { clean, views } = analyze(postingText("evs-supervisor"), vault);
  const byCode = (code: string) => views.find((v) => v.req.code === code)!;

  it("drops citations to facts that don't exist", () => {
    expect(clean.requirements[2]?.evidence_fact_ids).toEqual(["fact-4", "fact-19", "fact-16", "fact-17"]);
  });

  it("calculates years from merged dates in code", () => {
    expect(byCode("R1").status).toBe("strong");
    expect(byCode("R1").yearsText).toMatch(/^Lead Custodian \+ Custodian \+ Part-time Custodian: at least \d+ yrs/);
    expect(byCode("R1").yearsText).toContain("This asks for 3.");
  });

  it("keeps or-logic and parts", () => {
    expect(byCode("R6").req).toMatchObject({ logic: "any", parts: ["High school diploma", "GED"] });
  });

  it("asks three questions about the real gaps", () => {
    expect(selectQuestions(views).map((v) => v.req.code)).toEqual(["R4", "R5", "R8"]);
    expect(byCode("R9").req.question).toBeNull();
  });

  it("treats English/Igbo as not-yet-in-record for Spanish, not as a gap", () => {
    expect(byCode("R9").status).toBe("unknown");
  });
});

describe("instructional designer × career changer", () => {
  const { views } = analyze(postingText("instructional-designer"), vaultFromResume("career-changer"));
  const byCode = (code: string) => views.find((v) => v.req.code === code)!;

  it("caps questions at 4, dropping the preferred one", () => {
    expect(selectQuestions(views).map((v) => v.req.code)).toEqual(["R1", "R2", "R3", "R4"]);
    expect(byCode("R7").req.question).toBeNull();
  });

  it("freelance time alone falls short of 2 years: partial, with the math shown", () => {
    expect(byCode("R1").status).toBe("partial");
    expect(byCode("R1").yearsText).toBe(
      "Freelance Instructional Designer: 1 yr 10 mos of relevant experience. This asks for 2.",
    );
  });

  it("an in-progress master's is only partial", () => {
    expect(byCode("R6").status).toBe("partial");
  });
});

describe("second application reuses a saved answer", () => {
  const statement =
    "Builds the weekly schedule for a 6-person crew and arranges coverage when staff call off, usually 2 or 3 times a month.";

  it("cites the answer fact and doesn't ask the same question again", () => {
    const vault = withAnswer(vaultFromResume("custodial-lead"), statement, "confirmed");
    const { views } = analyze(postingText("evs-supervisor"), vault);
    const r4 = views.find((v) => v.req.code === "R4")!;
    expect(r4.status).toBe("strong");
    expect(r4.evidence.map((f) => f.code)).toEqual(["E26"]);
    expect(selectQuestions(views).map((v) => v.req.code)).toEqual(["R5", "R8"]);
  });

  it("an unconfirmed answer shows as Needs your OK", () => {
    const vault = withAnswer(vaultFromResume("custodial-lead"), statement, "pending");
    const { views } = analyze(postingText("evs-supervisor"), vault);
    expect(views.find((v) => v.req.code === "R4")!.status).toBe("hidden");
  });
});

describe("analysis guards", () => {
  const vault = vaultFromResume("custodial-lead");
  const raw: Analysis = {
    title: "  ",
    employer: "Acme",
    ignored: "Pay",
    requirements: [
      { text: "Salary range $50k-$60k", kind: "required", logic: "all", parts: [], status: "unknown", evidence: [], explanation: "", question: null, yearsRequired: null, relevantJobs: [] },
      { text: "Experience with mops", kind: "required", logic: "any", parts: ["Mops"], status: "strong", evidence: ["E4", "E4", "e8", "j1"], explanation: "x", question: "Do you mop?", yearsRequired: null, relevantJobs: ["j1"] },
      { text: "experience with  MOPS", kind: "required", logic: "all", parts: [], status: "strong", evidence: [], explanation: "", question: null, yearsRequired: null, relevantJobs: [] },
      { text: "5 years cleaning", kind: "preferred", logic: "all", parts: [], status: "partial", evidence: [], explanation: "", question: "More?", yearsRequired: 5, relevantJobs: ["J2", "j9"] },
    ],
  };
  const clean = postProcessAnalysis(raw, vault.jobs, vault.facts, asOf);

  it("drops boilerplate and duplicates, dedupes citations, ignores unknown codes", () => {
    expect(clean.requirements.map((r) => r.text)).toEqual(["Experience with mops", "5 years cleaning"]);
    expect(clean.requirements[0]?.evidence_fact_ids).toEqual(["fact-4", "fact-8"]);
    expect(clean.requirements[0]?.logic).toBe("all");
    expect(clean.requirements[0]?.relevant_job_ids).toEqual([]);
    expect(clean.requirements[1]?.relevant_job_ids).toEqual(["job-2"]);
    expect(clean.title).toBe("Untitled job");
  });

  it("removes the question on an item code already shows as supported", () => {
    expect(clean.requirements[0]?.question).toBeNull();
    expect(clean.requirements[1]?.question).toBe("More?");
  });

  it("recognizes boilerplate without catching real requirements", () => {
    expect(isBoilerplate("Equal Opportunity Employer")).toBe(true);
    expect(isBoilerplate("Experience with insurance verification")).toBe(false);
    expect(isBoilerplate("Proficiency with Microsoft Office")).toBe(false);
    // Real requirements that mention pay or benefits words are kept.
    expect(isBoilerplate("Experience with health insurance claims and billing")).toBe(false);
    expect(isBoilerplate("Knowledge of workers' compensation claims")).toBe(false);
    expect(isBoilerplate("Knows how to apply infection-control protocols")).toBe(false);
    expect(isBoilerplate("Able to process 40 claims per hour")).toBe(false);
    // Offer and logistics text is still dropped.
    expect(isBoilerplate("Competitive salary and benefits package")).toBe(true);
    expect(isBoilerplate("$18 to $22 per hour, plus shift differential")).toBe(true);
    expect(isBoilerplate("Submit your resume through our careers page")).toBe(true);
  });

  it("shows the AI durations computed by code and marks unconfirmed facts", () => {
    const record = formatRecord(vault.jobs, [{ ...vault.facts[0]!, status: "pending" }], asOf);
    expect(record).toContain("j1: Lead Custodian at Kettering Valley Hospital, Dayton, OH. Mar 2020 – Present (6 yrs 8 mos).");
    expect(record).toContain("E1 [summary_claim] (unconfirmed)");
  });
});

describe("answer to fact", () => {
  const answer = "Yes, I make the weekly schedule for my 6 person crew and I find someone to cover when people call off, usually 2 or 3 times a month.";

  it("uses the recorded clean statement", () => {
    const request = answerRequest({ requirement: "Experience building staff schedules and covering call-offs", question: "q", answer, relatedFacts: [] });
    const raw = answerSchema.parse(JSON.parse(readFixture("ai", "answer_to_fact", `${request.fixtureKey}.json`)));
    const clean = postProcessAnswer(raw, answer);
    expect(clean).toMatchObject({ has: true, status: "strong", usedOwnWords: false });
    expect(clean.statement).toMatch(/^Builds the weekly schedule for a 6-person crew/);
  });

  it("falls back to the person's own words if the AI adds numbers", () => {
    const clean = postProcessAnswer({ has: true, statement: "Scheduled a crew of 12.", status: "strong", explanation: "x" }, answer);
    expect(clean.usedOwnWords).toBe(true);
    expect(clean.statement).toBe(`${answer}`);
  });

  it("falls back if the AI adds authority the answer doesn't claim", () => {
    const clean = postProcessAnswer(
      { has: true, statement: "Managed scheduling for a 6-person crew.", status: "strong", explanation: "x" },
      "I make the schedule for my crew of 6",
    );
    expect(clean.usedOwnWords).toBe(true);
    expect(clean.statement).toBe("I make the schedule for my crew of 6.");
  });

  it("'I don't have this' style answers become no fact", () => {
    expect(postProcessAnswer({ has: false, statement: "", status: "gap", explanation: "x" }, "No").outcome).toBe("said_no");
  });

  it("an off-topic answer is unclear, never a gap", () => {
    expect(postProcessAnswer({ has: false, statement: "", status: "partial", explanation: "x" }, "I like dogs").outcome).toBe("unclear");
  });

  it("the AI can't turn a described skill into a gap", () => {
    const clean = postProcessAnswer({ has: true, statement: "Covers call-offs.", status: "gap", explanation: "x" }, "I cover call-offs");
    expect(clean).toMatchObject({ outcome: "fact", has: true, status: "partial" });
  });
});
