import { z } from "zod";
import type { DerivedStatus, Fact, Job, PageTarget, ReqKind } from "@/lib/domain";
import { endDateSortKey, type YearMonth } from "@/lib/dates/parse";
import { experienceFor } from "@/lib/dates/intervals";
import { formatDateRange } from "@/lib/dates/format";
import { STATUS_LABELS } from "@/lib/matching/status";
import { checkYearsClaim } from "@/lib/vault/summary-claims";
import { fixtureKey } from "@/lib/ai/fixture-key";
import type { StructuredRequest } from "@/lib/ai/provider";
import type { ResumeContent } from "@/lib/render/model";

// 7.4 Generate a tailored resume from confirmed facts only.

export const generationSchema = z.object({
  summary: z.object({ text: z.string(), evidence: z.array(z.string()) }),
  jobs: z.array(
    z.object({
      job: z.string(),
      bullets: z.array(
        z.object({
          text: z.string(),
          evidence: z.array(z.string()),
          requirements: z.array(z.string()),
          relevance: z.number(),
        }),
      ),
    }),
  ),
  skills: z.array(z.object({ text: z.string(), evidence: z.array(z.string()) })),
});

export type Generation = z.infer<typeof generationSchema>;

export const PAGE_TARGET_LABELS: Record<PageTarget, string> = {
  strict_one: "Strictly one page",
  one_if_possible: "One page if possible",
  up_to_two: "Up to two pages",
};

const LENGTH_GUIDE: Record<PageTarget, string> = {
  strict_one: "Strictly one page: 10 to 12 bullets in total, the most relevant first.",
  one_if_possible: "One page if possible: about 10 to 14 bullets in total.",
  up_to_two: "Up to two pages: about 4 to 6 bullets for each recent role, fewer for older roles.",
};

export const GENERATE_SYSTEM = `You write a tailored resume from a person's confirmed career facts. Every line must be defensible in an interview.

Rules:
- Every bullet cites the fact codes (E1, E2…) it rewrites in "evidence". Use only codes from the confirmed facts list. Combining two or three related facts into one bullet is fine.
- Rephrase for clarity and relevance to the job. Use the posting's vocabulary only where the cited facts support it.
- Never add numbers, tools, team sizes, results, authority (led, managed, supervised, administered, oversaw) or scope that the cited facts don't state. If a fact says "helped", the bullet says "helped".
- Don't output job titles, employers or dates: the app prints those from the record. Group bullets under the job code ("j1") they belong to; put a bullet under a job only if its facts belong to that job.
- "requirements": the requirement codes (R1…) a bullet addresses, or empty.
- "relevance": 3 = addresses a required item, 2 = supports one, 1 = general. Order bullets by relevance within each job.
- Summary: 1 or 2 sentences with citations. Don't restate a summary claim that the dates don't support (see the claim check below).
- Skills: up to 10, each citing a skill fact. Only skills that help for this job.
- Plain, active, specific language. No first person. No clichés ("results-driven", "team player").`;

export interface GenerationInput {
  application: { title: string; employer: string };
  requirements: { code: string; text: string; kind: ReqKind; status: DerivedStatus }[];
  jobs: Job[];
  facts: Fact[];
  pageTarget: PageTarget;
  asOf: YearMonth;
}

export function generationRequest(input: GenerationInput, signal?: AbortSignal): StructuredRequest<Generation> {
  const confirmedJobs = input.jobs
    .filter((j) => j.status === "confirmed")
    .sort((a, b) => endDateSortKey(b.end_date) - endDateSortKey(a.end_date));
  const codeOfJob = new Map(input.jobs.map((j) => [j.id, j.code]));
  const confirmed = input.facts.filter((f) => f.status === "confirmed");
  const experience = experienceFor(confirmedJobs, input.asOf);

  const requirementLines = input.requirements.map(
    (r) => `- ${r.code} (${r.kind}, ${STATUS_LABELS[r.status]}): ${r.text}`,
  );
  const jobLines = confirmedJobs.map(
    (j) => `- ${j.code}: ${j.title} at ${j.employer} (${formatDateRange(j.start_date, j.end_date)})`,
  );
  const factLines = confirmed
    .sort((a, b) => codeNum(a.code) - codeNum(b.code))
    .map((f) => {
      const job = f.job_id ? codeOfJob.get(f.job_id) : null;
      return `- ${f.code} [${f.type}${job ? `, ${job}` : ""}]: ${f.text}`;
    });
  const claimLines = confirmed
    .filter((f) => f.type === "summary_claim")
    .map((f) => {
      const check = checkYearsClaim(f.text, experience);
      if (!check) return null;
      return `- ${f.code}: ${check.ok ? "the dates support this" : "the dates DON'T support this; don't restate it"}`;
    })
    .filter(Boolean);

  const prompt = [
    `<job>${input.application.title}${input.application.employer ? ` at ${input.application.employer}` : ""}</job>`,
    `<length>${LENGTH_GUIDE[input.pageTarget]}</length>`,
    `<requirements>\n${requirementLines.join("\n")}\n</requirements>`,
    `<jobs>\n${jobLines.join("\n") || "- none"}\n</jobs>`,
    `<confirmed_facts>\n${factLines.join("\n")}\n</confirmed_facts>`,
    claimLines.length ? `<summary_claim_check>\n${claimLines.join("\n")}\n</summary_claim_check>` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    task: "generate_resume",
    tier: "default",
    system: GENERATE_SYSTEM,
    prompt,
    schema: generationSchema,
    maxTokens: 12_000,
    signal,
    fixtureKey: fixtureKey(`${input.application.title}`, prompt),
  };
}

/**
 * Code post-processing: citations must be this person's CONFIRMED facts,
 * bullets must sit under a confirmed job, skills must cite skill facts.
 * A bullet left with no valid citation is kept so the person can see it,
 * but Truth Guard will block it.
 */
export function postProcessGeneration(raw: Generation, input: GenerationInput): ResumeContent {
  const confirmedByCode = new Map(
    input.facts.filter((f) => f.status === "confirmed").map((f) => [f.code.toUpperCase(), f]),
  );
  const jobByCode = new Map(input.jobs.filter((j) => j.status === "confirmed").map((j) => [j.code.toLowerCase(), j]));
  const reqCodes = new Set(input.requirements.map((r) => r.code.toUpperCase()));
  const cite = (codes: string[]) =>
    [...new Set(codes.map((c) => confirmedByCode.get(c.trim().toUpperCase())?.id).filter((id): id is string => !!id))];

  let n = 0;
  const sections = new Map<string, ResumeContent["jobs"][number]>();
  for (const section of raw.jobs) {
    const job = jobByCode.get(section.job.trim().toLowerCase());
    if (!job) continue;
    const target = sections.get(job.id) ?? { job_id: job.id, bullets: [] };
    for (const b of section.bullets) {
      const text = b.text.trim().replace(/\s+/g, " ").replace(/^[•\-–]\s*/, "");
      if (!text) continue;
      target.bullets.push({
        id: `b${++n}`,
        text: text.slice(0, 600),
        fact_ids: cite(b.evidence),
        requirement_codes: [...new Set(b.requirements.map((c) => c.trim().toUpperCase()).filter((c) => reqCodes.has(c)))],
        relevance: clampRelevance(b.relevance),
        included: true,
        reviewed: false,
        ai_check: null,
      });
    }
    sections.set(job.id, target);
  }
  // Keep the vault's job order (most recent first); most relevant bullets first.
  const jobOrder = [...input.jobs]
    .filter((j) => j.status === "confirmed")
    .sort((a, b) => endDateSortKey(b.end_date) - endDateSortKey(a.end_date))
    .map((j) => j.id);
  const jobs = jobOrder
    .map((id) => sections.get(id))
    .filter((s): s is ResumeContent["jobs"][number] => !!s)
    .map((s) => ({ ...s, bullets: [...s.bullets].sort((a, b) => b.relevance - a.relevance) }));

  const skillIds = new Set(input.facts.filter((f) => f.type === "skill" && f.status === "confirmed").map((f) => f.id));
  const seenSkills = new Set<string>();
  const skills = raw.skills
    .map((s) => ({ text: s.text.trim(), fact_ids: cite(s.evidence).filter((id) => skillIds.has(id)), included: true }))
    .filter((s) => s.text && s.fact_ids.length > 0 && !seenSkills.has(s.text.toLowerCase()) && seenSkills.add(s.text.toLowerCase()))
    .slice(0, 10);

  const summaryText = raw.summary.text.trim().replace(/\s+/g, " ");
  return {
    summary: summaryText
      ? { text: summaryText.slice(0, 800), fact_ids: cite(raw.summary.evidence), reviewed: false, ai_check: null }
      : null,
    jobs,
    skills,
  };
}

function clampRelevance(value: number): 1 | 2 | 3 {
  const r = Math.round(value);
  return r >= 3 ? 3 : r <= 1 ? 1 : 2;
}

function codeNum(code: string) {
  return Number(code.replace(/\D/g, "")) || 0;
}
