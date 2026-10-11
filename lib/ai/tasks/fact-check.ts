import { z } from "zod";
import { fixtureKey } from "@/lib/ai/fixture-key";
import type { StructuredRequest } from "@/lib/ai/provider";
import type { ResumeContent } from "@/lib/render/model";

// 7.5 Separate fact-check pass after every (re)generation. Its verdicts are
// soft flags only; code decides what can be exported.

export const factCheckSchema = z.object({
  checks: z.array(z.object({ i: z.number(), ok: z.boolean(), issue: z.string().nullable() })),
});

export type FactCheck = z.infer<typeof factCheckSchema>;

export const FACT_CHECK_SYSTEM = `You are a strict fact-checker for resume lines. Compare each line ONLY to the facts it cites.

Flag a line (ok: false) if it states anything the cited facts don't: higher authority or ownership (led, managed, supervised, owned), larger scope or team size, new tools or systems, numbers, outcomes or results, credentials, or completed status for something unfinished.

Rewording, reordering, summarizing and combining cited facts are fine (ok: true).

For each flagged line, "issue" is one short plain sentence to the person, naming what the facts do and don't say, for example: "The cited fact says you trained 9 new hires, not 12." Use null when ok is true. Return one check per line, using the line's index "i".`;

export interface CheckLine {
  /** Where the verdict goes: "summary" or a bullet id. */
  target: string;
  text: string;
  facts: { code: string; text: string }[];
}

export function linesToCheck(content: ResumeContent, factsById: Map<string, { code: string; text: string }>): CheckLine[] {
  const cited = (ids: string[]) => ids.map((id) => factsById.get(id)).filter((f): f is { code: string; text: string } => !!f);
  const lines: CheckLine[] = [];
  if (content.summary) lines.push({ target: "summary", text: content.summary.text, facts: cited(content.summary.fact_ids) });
  for (const job of content.jobs) {
    for (const b of job.bullets) lines.push({ target: b.id, text: b.text, facts: cited(b.fact_ids) });
  }
  return lines;
}

export function factCheckRequest(lines: CheckLine[], signal?: AbortSignal): StructuredRequest<FactCheck> {
  const body = lines
    .map((l, i) => {
      const facts = l.facts.map((f) => `    - ${f.code}: ${f.text}`).join("\n") || "    - (no facts cited)";
      return `[${i}] Line: ${l.text}\n  Cited facts:\n${facts}`;
    })
    .join("\n\n");
  return {
    task: "fact_check",
    tier: "default",
    system: FACT_CHECK_SYSTEM,
    prompt: `<lines>\n${body}\n</lines>`,
    schema: factCheckSchema,
    maxTokens: 6000,
    signal,
    fixtureKey: fixtureKey("fact check", body),
  };
}

/** Attach verdicts to the content. Lines without a verdict stay unchecked (null). */
export function applyFactCheck(content: ResumeContent, lines: CheckLine[], result: FactCheck): ResumeContent {
  const verdicts = new Map<string, { ok: boolean; issue: string | null }>();
  for (const check of result.checks) {
    const line = lines[check.i];
    if (!line) continue;
    verdicts.set(line.target, { ok: check.ok, issue: check.ok ? null : check.issue?.trim() || "This line says more than the facts it cites." });
  }
  return {
    ...content,
    summary: content.summary ? { ...content.summary, ai_check: verdicts.get("summary") ?? null } : null,
    jobs: content.jobs.map((j) => ({
      ...j,
      bullets: j.bullets.map((b) => ({ ...b, ai_check: verdicts.get(b.id) ?? null })),
    })),
  };
}
