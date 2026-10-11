import { z } from "zod";
import type { Fact, Job } from "@/lib/domain";
import type { YearMonth } from "@/lib/dates/parse";
import { jobMonths } from "@/lib/dates/intervals";
import { formatDateRange, formatMonths } from "@/lib/dates/format";
import { deriveStatus } from "@/lib/matching/status";
import { MAX_QUESTIONS } from "@/lib/matching/view";
import { fixtureKey } from "@/lib/ai/fixture-key";
import type { StructuredRequest } from "@/lib/ai/provider";

// 7.2 Analyze a job posting against the person's vault.

export const MAX_POSTING_CHARS = 40_000;
export const MAX_REQUIREMENTS = 12;

export const analysisSchema = z.object({
  title: z.string(),
  employer: z.string(),
  ignored: z.string(),
  requirements: z.array(
    z.object({
      text: z.string(),
      kind: z.enum(["required", "preferred"]),
      logic: z.enum(["all", "any"]),
      parts: z.array(z.string()),
      status: z.enum(["strong", "partial", "hidden", "unknown"]),
      evidence: z.array(z.string()),
      explanation: z.string(),
      question: z.string().nullable(),
      yearsRequired: z.number().nullable(),
      relevantJobs: z.array(z.string()),
    }),
  ),
});

export type Analysis = z.infer<typeof analysisSchema>;

export const ANALYZE_SYSTEM = `You compare a job posting with a person's career record and explain, requirement by requirement, what their record supports. You write for an everyday job seeker, not a recruiter.

How to read the posting:
- Ignore pay, benefits, location, schedule, company background, equal-opportunity text, application instructions and section headings. Never turn them into requirements. Summarize what you ignored in "ignored" as a short plain list (for example: "Pay ($52,000–$61,000), benefits, the hybrid schedule, and the equal-opportunity statement").
- Merge near-duplicates. Return 6 to 12 requirements. Mark each "required" or "preferred" from the posting's own wording ("must", "required", "need" vs "preferred", "nice to have", "a plus").
- Preserve logic: "X or Y" → logic "any"; "X and Y" → logic "all". List the parts in "parts" when there is more than one, otherwise an empty list.
- "title" and "employer" are the job title and the hiring organization as the posting states them.

How to judge each requirement against the record:
- Cite the fact codes (E1, E2…) that support it in "evidence". Cite only codes that appear in the record. Facts marked (unconfirmed) may be cited; the app handles that.
- status "strong" = the cited facts fully support it. "partial" = a meaningful part is missing. "hidden" = the record suggests they likely have it but it needs clarifying. "unknown" = nothing in the record addresses it. Never decide that they lack something: missing from the record is "unknown", not a gap.
- Don't stretch evidence. Completing training in a system is not administering it. Helping coworkers is not supervising them. Using a tool as a learner is not managing it. A degree in progress is not a completed degree. An unfinished program is not a credential.
- For a minimum amount of experience ("3+ years of…"), set "yearsRequired" to the number and list the job codes whose work counts in "relevantJobs". Do NOT add up years yourself; the app calculates them from the dates. Otherwise yearsRequired is null and relevantJobs is empty.
- "explanation": one or two plain sentences to the person as "you", saying what supports it and what's missing. No jargon.

Questions:
- Ask a question only when status is partial, hidden or unknown AND an honest answer could add a real fact to their record. Otherwise "question" is null.
- Never ask about something the record already answers. Build on what the record says and ask for the specific missing part, for example: "Your record says you lead a crew of 6. Do you also build their schedules? If so, how often?"
- One question per requirement, in plain words, answerable in a sentence or two. At most 4 questions in total; ask about required items first.`;

/** Jobs and facts as the AI sees them. Durations come from code. */
export function formatRecord(jobs: Job[], facts: Fact[], asOf: YearMonth): string {
  const byCode = (a: { code: string }, b: { code: string }) => codeNumber(a.code) - codeNumber(b.code);
  const jobLines = [...jobs].sort(byCode).map((j) => {
    const months = jobMonths(j, asOf);
    const duration = months === null ? "dates unclear" : formatMonths(months);
    return `- ${j.code}: ${j.title} at ${j.employer}${j.location ? `, ${j.location}` : ""}. ${formatDateRange(j.start_date, j.end_date)} (${duration}${j.dates_uncertain ? ", dates uncertain" : ""}).${j.status === "confirmed" ? "" : " (unconfirmed)"}`;
  });
  const codeOfJob = new Map(jobs.map((j) => [j.id, j.code]));
  const factLines = facts
    .filter((f) => f.status !== "unsupported")
    .sort(byCode)
    .map((f) => {
      const job = f.job_id ? codeOfJob.get(f.job_id) : null;
      return `- ${f.code} [${f.type}${job ? `, ${job}` : ""}]${f.status === "confirmed" ? "" : " (unconfirmed)"}: ${f.text}`;
    });
  return `Jobs (durations are calculated from the dates; don't recalculate them):\n${jobLines.join("\n") || "- none"}\n\nFacts:\n${factLines.join("\n") || "- none"}`;
}

/**
 * What the analysis depends on, minus things that change without changing the
 * meaning (confirmation status, today's date). Keys recorded fixtures.
 */
export function vaultDigest(jobs: Job[], facts: Fact[]): string {
  const codeOfJob = new Map(jobs.map((j) => [j.id, j.code]));
  const j = [...jobs]
    .sort((a, b) => codeNumber(a.code) - codeNumber(b.code))
    .map((x) => [x.code, x.title, x.employer, x.start_date, x.end_date].join("|"));
  const f = facts
    .filter((x) => x.status !== "unsupported")
    .sort((a, b) => codeNumber(a.code) - codeNumber(b.code))
    .map((x) => [x.code, x.type, x.job_id ? codeOfJob.get(x.job_id) : "", x.text].join("|"));
  return [...j, ...f].join("\n");
}

export function analysisRequest(
  posting: string,
  jobs: Job[],
  facts: Fact[],
  asOf: YearMonth,
  signal?: AbortSignal,
): StructuredRequest<Analysis> {
  return {
    task: "analyze_posting",
    tier: "default",
    system: ANALYZE_SYSTEM,
    prompt: `<career_record>\n${formatRecord(jobs, facts, asOf)}\n</career_record>\n\n<job_posting>\n${posting}\n</job_posting>`,
    schema: analysisSchema,
    maxTokens: 12_000,
    signal,
    fixtureKey: fixtureKey(posting, vaultDigest(jobs, facts)),
  };
}

// ---------------------------------------------------------------------------
// Code post-processing.

export interface CleanRequirement {
  code: string;
  position: number;
  text: string;
  kind: "required" | "preferred";
  logic: "all" | "any";
  parts: string[];
  ai_status: "strong" | "partial" | "hidden" | "unknown";
  explanation: string;
  question: string | null;
  years_required: number | null;
  relevant_job_ids: string[];
  evidence_fact_ids: string[];
}

export interface CleanAnalysis {
  title: string;
  employer: string;
  ignored: string;
  requirements: CleanRequirement[];
}

// Backstop for the prompt rule: posting boilerplate never becomes a requirement.
const BOILERPLATE =
  /\b(salary|compensation|pay range|per hour|per year|equal opportunity|eeo\b|401\s?\(k\)|403\s?\(b\)|paid time off|\bpto\b|benefits package|health insurance|dental and vision|tuition reimbursement|stipend|how to apply|submit your resume|apply (at|by|through|online)|shift differential)/i;

export function isBoilerplate(text: string): boolean {
  return BOILERPLATE.test(text);
}

export function postProcessAnalysis(raw: Analysis, jobs: Job[], facts: Fact[], asOf: YearMonth): CleanAnalysis {
  // Only this user's live facts and jobs can be cited.
  const factByCode = new Map(facts.filter((f) => f.status !== "unsupported").map((f) => [f.code.toUpperCase(), f]));
  const jobByCode = new Map(jobs.map((j) => [j.code.toLowerCase(), j]));
  const seen = new Set<string>();

  const requirements: CleanRequirement[] = [];
  for (const r of raw.requirements) {
    const text = r.text.trim().replace(/\s+/g, " ");
    const key = text.toLowerCase();
    if (!text || seen.has(key) || isBoilerplate(text)) continue;
    seen.add(key);

    const evidence = unique(r.evidence.map((c) => factByCode.get(c.trim().toUpperCase())?.id).filter(isString));
    const relevantJobs = unique(r.relevantJobs.map((c) => jobByCode.get(c.trim().toLowerCase())?.id).filter(isString));
    const years = r.yearsRequired !== null && r.yearsRequired > 0 && r.yearsRequired <= 50 ? r.yearsRequired : null;
    const parts = r.parts.map((p) => p.trim()).filter(Boolean);

    requirements.push({
      code: "",
      position: 0,
      text: text.slice(0, 500),
      kind: r.kind,
      logic: parts.length > 1 ? r.logic : "all",
      parts: parts.length > 1 ? parts : [],
      ai_status: r.status,
      explanation: r.explanation.trim(),
      question: r.question?.trim() || null,
      years_required: years,
      relevant_job_ids: years ? relevantJobs : [],
      evidence_fact_ids: evidence,
    });
    if (requirements.length >= MAX_REQUIREMENTS) break;
  }

  // Required first, then preferred, keeping the posting's order within each.
  requirements.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "required" ? -1 : 1));
  requirements.forEach((r, i) => {
    r.code = `R${i + 1}`;
    r.position = i + 1;
  });

  // Questions: none where code already shows full support; at most 4, required first.
  const factById = new Map(facts.map((f) => [f.id, f]));
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  let asked = 0;
  for (const r of requirements) {
    if (!r.question) continue;
    const derived = deriveStatus(
      { ai_status: r.ai_status, user_gap: false, answered: false, years_required: r.years_required },
      r.evidence_fact_ids.map((id) => factById.get(id)!).filter(Boolean),
      r.relevant_job_ids.map((id) => jobById.get(id)!).filter(Boolean),
      asOf,
    );
    if (derived.status === "strong" || asked >= MAX_QUESTIONS) {
      r.question = null;
    } else {
      asked++;
    }
  }

  return {
    title: raw.title.trim().slice(0, 200) || "Untitled job",
    employer: raw.employer.trim().slice(0, 200),
    ignored: raw.ignored.trim(),
    requirements,
  };
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function isString(x: string | undefined): x is string {
  return typeof x === "string";
}

function codeNumber(code: string) {
  return Number(code.replace(/\D/g, "")) || 0;
}
