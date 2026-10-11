import { z } from "zod";
import { endDateSortKey, parseResumeDate } from "@/lib/dates/parse";
import { fixtureKey } from "@/lib/ai/fixture-key";
import type { StructuredRequest } from "@/lib/ai/provider";

// 7.1 Extract resume → structured facts.

export const EXTRACTED_FACT_TYPES = [
  "duty",
  "accomplishment",
  "skill",
  "education",
  "certification",
  "training",
  "summary_claim",
  "other",
] as const;

export const extractionSchema = z.object({
  profile: z.object({
    name: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    location: z.string().nullable(),
    headline: z.string().nullable(),
  }),
  jobs: z.array(
    z.object({
      key: z.string(),
      employer: z.string(),
      title: z.string(),
      location: z.string().nullable(),
      start: z.string().nullable(),
      end: z.string().nullable(),
      datesUncertain: z.boolean(),
    }),
  ),
  facts: z.array(
    z.object({
      type: z.enum(EXTRACTED_FACT_TYPES),
      jobKey: z.string().nullable(),
      text: z.string(),
      source: z.string(),
      note: z.string().nullable(),
    }),
  ),
  warnings: z.array(z.string()),
});

export type Extraction = z.infer<typeof extractionSchema>;

export const EXTRACT_SYSTEM = `You read resumes to build a structured career record that the person will review and confirm, fact by fact.

Extract ONLY what the resume states. Never add skills, numbers, tools, titles, employers, dates or outcomes that are not written. When something is unclear, leave it out or flag it; don't guess.

Rules:
- Contact details (name, email, phone, city/state, LinkedIn) go in "profile", never in facts. "headline" is the resume's own title line or tagline if it has one, otherwise null.
- Each job heading becomes one job with a short unique "key" (j1, j2, …). Duties and accomplishments listed under a job become facts with that job's key as "jobKey".
- One short, self-contained statement per fact, with the same meaning as the resume. Light grammar cleanup only: full sentence, past tense for past jobs. Keep every number exactly as written. Do not merge two different claims into one fact, and do not split one claim into two.
- "accomplishment" = a result or achievement (often with a number or outcome). "duty" = a regular responsibility.
- Skills lists: one fact per distinct skill or tool (type "skill", jobKey null). Skills mentioned only inside a duty stay in that duty.
- Education: one fact per credential (type "education", jobKey null). State completion plainly in the text: "Completed 2021", "In progress, expected 2027", or "Attended; not completed". Never present unfinished study as completed. If the resume doesn't say, write "Completion not stated".
- Certifications and licenses are type "certification". Courses, workshops and general training are type "training". Don't upgrade training into a certification.
- Claims from a summary or profile section ("8+ years of experience", "proven leader") are type "summary_claim", jobKey null. Keep them separate from job facts.
- Volunteer work, awards, languages and anything else go in "other" unless they clearly fit a type above. Volunteer roles with their own heading may be jobs.
- Dates: "YYYY-MM", "YYYY", or "present". If the resume gives only a year, use "YYYY". If a date is missing, ambiguous or looks wrong, use your best reading, set datesUncertain to true, and add a warning. Use null only when there is no date at all.
- "source" = the exact passage from the resume the fact came from, at most 25 words, copied as written.
- "note" = null unless something about the fact needs the person's attention (e.g. "Year not given").
- "warnings" = real problems only, in plain language for the person: scrambled or garbled text, text that looks like a scanned page, missing dates, sections you couldn't read. Empty if none.`;

export function extractionRequest(resumeText: string, signal?: AbortSignal): StructuredRequest<Extraction> {
  return {
    task: "extract_resume",
    tier: "default",
    system: EXTRACT_SYSTEM,
    prompt: `Here is the resume. Extract it following the rules.\n\n<resume>\n${resumeText}\n</resume>`,
    schema: extractionSchema,
    maxTokens: 16_000,
    signal,
    fixtureKey: fixtureKey(resumeText),
  };
}

// ---------------------------------------------------------------------------
// Code post-processing. The AI's output is a draft: code decides what's kept.

export interface CleanJob {
  key: string;
  employer: string;
  title: string;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  dates_uncertain: boolean;
}

export interface CleanFact {
  type: (typeof EXTRACTED_FACT_TYPES)[number];
  jobKey: string | null;
  text: string;
  source_passage: string | null;
  note: string | null;
}

export interface CleanExtraction {
  profile: Extraction["profile"];
  jobs: CleanJob[];
  facts: CleanFact[];
  warnings: string[];
}

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE = /(?:\+?\d[\s().-]*){10,}/;
const URL_ONLY = /^(https?:\/\/|www\.)\S+$/i;

export function postProcessExtraction(raw: Extraction): CleanExtraction {
  const warnings = raw.warnings.map((w) => w.trim()).filter(Boolean);

  const seenKeys = new Set<string>();
  const jobs: CleanJob[] = [];
  for (const job of raw.jobs) {
    const key = job.key.trim();
    if (!key || seenKeys.has(key)) continue;
    if (!job.employer.trim() && !job.title.trim()) continue;
    seenKeys.add(key);
    const start = normalizeDate(job.start);
    const end = normalizeDate(job.end);
    const uncertain = job.datesUncertain || start.changed || end.changed || start.value === null || end.value === null;
    jobs.push({
      key,
      employer: job.employer.trim(),
      title: job.title.trim(),
      location: job.location?.trim() || null,
      start_date: start.value,
      end_date: end.value,
      dates_uncertain: uncertain,
    });
  }
  jobs.sort((a, b) => endDateSortKey(b.end_date) - endDateSortKey(a.end_date));

  const facts: CleanFact[] = [];
  for (const fact of raw.facts) {
    const text = fact.text.trim().replace(/\s+/g, " ");
    if (!text) continue;
    // Contact details never become facts.
    if (EMAIL.test(text) || PHONE.test(text) || URL_ONLY.test(text)) continue;
    let jobKey = fact.jobKey?.trim() || null;
    if (jobKey && !seenKeys.has(jobKey)) jobKey = null;
    // Only duties and accomplishments hang under a job.
    if (fact.type !== "duty" && fact.type !== "accomplishment") jobKey = fact.type === "other" ? jobKey : null;
    facts.push({
      type: fact.type,
      jobKey,
      text: text.slice(0, 1000),
      source_passage: limitWords(fact.source.trim(), 25) || null,
      note: fact.note?.trim() || null,
    });
  }

  return {
    profile: {
      name: clean(raw.profile.name),
      email: clean(raw.profile.email),
      phone: clean(raw.profile.phone),
      location: clean(raw.profile.location),
      headline: clean(raw.profile.headline),
    },
    jobs,
    facts,
    warnings,
  };
}

function clean(value: string | null): string | null {
  const v = value?.trim();
  return v ? v : null;
}

function limitWords(text: string, max: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  return words.length <= max ? words.join(" ") : `${words.slice(0, max).join(" ")}…`;
}

/** Keep a date only if it's in a format we accept; otherwise drop it and flag. */
function normalizeDate(value: string | null): { value: string | null; changed: boolean } {
  if (value === null || value.trim() === "") return { value: null, changed: false };
  const parsed = parseResumeDate(value);
  switch (parsed.kind) {
    case "present":
      return { value: "present", changed: false };
    case "month":
      return { value: `${parsed.year}-${String(parsed.month).padStart(2, "0")}`, changed: false };
    case "year":
      return { value: String(parsed.year), changed: false };
    case "invalid":
      return { value: null, changed: true };
  }
}
