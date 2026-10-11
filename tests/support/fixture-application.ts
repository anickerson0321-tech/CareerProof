import type { Requirement } from "@/lib/domain";
import type { YearMonth } from "@/lib/dates/parse";
import { analysisRequest, analysisSchema, postProcessAnalysis } from "@/lib/ai/tasks/analyze-posting";
import { answerRequest, answerSchema, postProcessAnswer } from "@/lib/ai/tasks/answer-to-fact";
import { buildRequirementViews } from "@/lib/matching/view";
import type { GenerationInput } from "@/lib/ai/tasks/generate-resume";
import { postingText, readFixture, vaultFromResume, withAnswer } from "./fixture-vault";

export const SCHEDULE_ANSWER =
  "Yes, I make the weekly schedule for my 6 person crew and I find someone to cover when people call off, usually 2 or 3 times a month.";

/**
 * Denise's application to the EVS supervisor job, in the state the E2E flow
 * reaches: vault confirmed, application compared, schedule question answered
 * and "Looks right" pressed.
 */
export function deniseAfterAnswer(asOf: YearMonth) {
  const base = vaultFromResume("custodial-lead");
  const posting = postingText("evs-supervisor");
  const analysisKey = analysisRequest(posting, base.jobs, base.facts, asOf).fixtureKey;
  const analysis = postProcessAnalysis(
    analysisSchema.parse(JSON.parse(readFixture("ai", "analyze_posting", `${analysisKey}.json`))),
    base.jobs,
    base.facts,
    asOf,
  );
  const r4 = analysis.requirements.find((r) => r.code === "R4")!;
  const answerKey = answerRequest({ requirement: r4.text, question: r4.question!, answer: SCHEDULE_ANSWER, relatedFacts: [] }).fixtureKey;
  const answer = postProcessAnswer(
    answerSchema.parse(JSON.parse(readFixture("ai", "answer_to_fact", `${answerKey}.json`))),
    SCHEDULE_ANSWER,
  );
  const vault = withAnswer(base, answer.statement, "confirmed");
  const answerFact = vault.facts[vault.facts.length - 1]!;

  const requirements: Requirement[] = analysis.requirements.map((r) =>
    r.code === "R4"
      ? { ...r, id: r.code, ai_status: answer.status, explanation: answer.explanation, answered: true, user_gap: false, evidence_fact_ids: [answerFact.id] }
      : { ...r, id: r.code, answered: false, user_gap: false },
  );
  const views = buildRequirementViews(requirements, vault.facts, vault.jobs, asOf);
  const input: GenerationInput = {
    application: { title: analysis.title, employer: analysis.employer },
    requirements: views.map((v) => ({ code: v.req.code, text: v.req.text, kind: v.req.kind, status: v.status })),
    jobs: vault.jobs,
    facts: vault.facts,
    pageTarget: "one_if_possible",
    asOf,
  };
  return { vault, requirements, views, input, analysis };
}
