import { fixtureKey } from "@/lib/ai/fixture-key";
import type { TextRequest } from "@/lib/ai/provider";
import type { Fact } from "@/lib/domain";
import type { RequirementView } from "@/lib/matching/view";

// 7.6 Cover letter, streamed. Built only from confirmed facts behind the
// strongest matches.

export const LETTER_SYSTEM = `You write short, honest cover letters for everyday job seekers.

Rules:
- Use ONLY the confirmed facts provided. Never add numbers, tools, titles, results or responsibilities they don't state.
- 230 to 320 words, 3 or 4 short paragraphs.
- Open with the specific role and one real reason the person fits.
- Focus on 2 or 3 connections between the job and their facts. Don't repeat the resume line by line.
- Warm, direct, plain language. No clichés such as "I am writing to express my interest", "team player", "results-driven" or "passionate".
- Start with "Dear Hiring Manager," and end with "Sincerely," then the person's name on the next line.
- No address block, no date line, no bracketed placeholders.
- Output only the letter text.`;

export const MAX_LETTER_MATCHES = 4;

export interface LetterInput {
  name: string;
  title: string;
  employer: string;
  views: RequirementView[];
}

/** Confirmed facts behind the strongest matches, required items first. */
export function letterFacts(views: RequirementView[]): { requirement: string; facts: Fact[] }[] {
  return views
    .filter((v) => v.status === "strong" || v.status === "partial")
    .sort((a, b) => rank(a) - rank(b))
    .map((v) => ({ requirement: v.req.text, facts: v.evidence.filter((f) => f.status === "confirmed") }))
    .filter((m) => m.facts.length > 0)
    .slice(0, MAX_LETTER_MATCHES);
}

function rank(v: RequirementView) {
  return (v.status === "strong" ? 0 : 2) + (v.req.kind === "required" ? 0 : 1);
}

export function letterRequest(input: LetterInput, signal?: AbortSignal): TextRequest {
  const matches = letterFacts(input.views)
    .map((m) => `- ${m.requirement}\n${m.facts.map((f) => `  - ${f.code}: ${f.text}`).join("\n")}`)
    .join("\n");
  const prompt = `<person>${input.name}</person>\n<job>${input.title}${input.employer ? ` at ${input.employer}` : ""}</job>\n<strongest_matches>\n${matches || "- (none yet)"}\n</strongest_matches>`;
  return {
    task: "cover_letter",
    tier: "default",
    system: LETTER_SYSTEM,
    prompt,
    maxTokens: 2000,
    signal,
    fixtureKey: fixtureKey(input.title, prompt),
  };
}
