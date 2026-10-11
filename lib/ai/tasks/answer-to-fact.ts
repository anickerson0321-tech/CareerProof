import { z } from "zod";
import { fixtureKey } from "@/lib/ai/fixture-key";
import type { StructuredRequest } from "@/lib/ai/provider";
import { unsupportedNumbers } from "@/lib/guard/numbers";
import { authorityWords } from "@/lib/guard/authority";

// 7.3 Turn a person's answer into one clean fact, then re-judge the requirement.

export const MAX_ANSWER_CHARS = 2000;

export const answerSchema = z.object({
  has: z.boolean(),
  statement: z.string(),
  status: z.enum(["strong", "partial", "gap"]),
  explanation: z.string(),
});

export type AnswerResult = z.infer<typeof answerSchema>;

export const ANSWER_SYSTEM = `You turn a job seeker's answer into one factual resume-style statement and re-judge one job requirement.

Rules for "statement":
- One sentence, resume style, no "I" (for example "Builds the weekly schedule for a 6-person crew.").
- Use ONLY what the answer says. Keep every number exactly as written. Add no scope, team size, titles, tools, results or authority (led, managed, supervised) the answer doesn't state.
- Fix spelling and grammar only.
- If the person says they don't have it, or the answer doesn't actually address the requirement, set "has" to false and "statement" to an empty string.

Then judge the requirement using the person's existing facts plus this new statement:
- "strong" = now fully supported; "partial" = still missing a meaningful part; "gap" only when the person said they don't have it.
- "explanation": one plain sentence to the person as "you".`;

export function answerRequest(input: {
  requirement: string;
  question: string;
  answer: string;
  relatedFacts: { code: string; text: string }[];
}): StructuredRequest<AnswerResult> {
  const related = input.relatedFacts.map((f) => `- ${f.code}: ${f.text}`).join("\n") || "- none";
  return {
    task: "answer_to_fact",
    tier: "fast",
    system: ANSWER_SYSTEM,
    prompt: `<requirement>${input.requirement}</requirement>\n<related_facts>\n${related}\n</related_facts>\n<question>${input.question}</question>\n<answer>${input.answer}</answer>`,
    schema: answerSchema,
    maxTokens: 1000,
    fixtureKey: fixtureKey(input.requirement, input.answer),
  };
}

export interface CleanAnswer {
  has: boolean;
  statement: string;
  status: "strong" | "partial";
  explanation: string;
  /** True when code replaced the AI's wording with the person's own words. */
  usedOwnWords: boolean;
}

/**
 * Code checks on the AI's statement: it may not add numbers or authority the
 * answer doesn't contain. If it does, we fall back to the person's own words.
 */
export function postProcessAnswer(raw: AnswerResult, answer: string): CleanAnswer {
  const explanation = raw.explanation.trim();
  if (!raw.has || raw.status === "gap") {
    return { has: false, statement: "", status: "partial", explanation, usedOwnWords: false };
  }
  let statement = raw.statement.trim().replace(/\s+/g, " ");
  let usedOwnWords = false;
  const addsNumbers = unsupportedNumbers(statement, [answer]).length > 0;
  const addsAuthority = authorityWords(statement).length > 0 && authorityWords(answer).length === 0;
  if (!statement || addsNumbers || addsAuthority) {
    statement = ownWords(answer);
    usedOwnWords = true;
  }
  return { has: true, statement: statement.slice(0, 1000), status: raw.status, explanation, usedOwnWords };
}

function ownWords(answer: string): string {
  const text = answer.trim().replace(/\s+/g, " ");
  const sentence = text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}
