import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Fact, Job } from "@/lib/domain";
import { cleanText } from "@/lib/extract/detect";
import { fixtureKey } from "@/lib/ai/fixture-key";
import { extractionSchema, postProcessExtraction } from "@/lib/ai/tasks/extract-resume";
import { planMerge } from "@/lib/vault/merge";

const root = join(__dirname, "..", "fixtures");

export function readFixture(...parts: string[]): string {
  return readFileSync(join(root, ...parts), "utf8");
}

export function postingText(name: string): string {
  return readFixture("postings", `${name}.txt`).trim();
}

/**
 * The vault a fresh user ends up with after importing a fixture resume and
 * pressing "Confirm all": same codes, order and text the database assigns.
 */
export function vaultFromResume(name: string, status: "confirmed" | "pending" = "confirmed"): { jobs: Job[]; facts: Fact[] } {
  const text = cleanText(readFixture("resumes", `${name}.txt`));
  const raw = extractionSchema.parse(JSON.parse(readFixture("ai", "extract_resume", `${fixtureKey(text)}.json`)));
  const plan = planMerge(postProcessExtraction(raw), [], []);
  const jobs: Job[] = plan.newJobs.map((j, i) => ({
    id: `job-${i + 1}`,
    code: `j${i + 1}`,
    employer: j.employer,
    title: j.title,
    location: j.location,
    start_date: j.start_date,
    end_date: j.end_date,
    dates_uncertain: j.dates_uncertain,
    status,
  }));
  const jobIdByKey = new Map(plan.newJobs.map((j, i) => [j.key, `job-${i + 1}`]));
  const facts: Fact[] = plan.newFacts.map((f, i) => ({
    id: `fact-${i + 1}`,
    code: `E${i + 1}`,
    type: f.type,
    job_id: f.jobKey ? (jobIdByKey.get(f.jobKey) ?? null) : null,
    text: f.text,
    source_passage: f.source_passage,
    origin: "resume",
    status,
    note: f.note,
  }));
  return { jobs, facts };
}

/** Adds a fact the way saving an answer does (origin "answer", unconfirmed). */
export function withAnswer(vault: { jobs: Job[]; facts: Fact[] }, text: string, status: "pending" | "confirmed" = "pending") {
  const n = vault.facts.length + 1;
  return {
    jobs: vault.jobs,
    facts: [
      ...vault.facts,
      {
        id: `fact-${n}`,
        code: `E${n}`,
        type: "answer" as const,
        job_id: null,
        text,
        source_passage: null,
        origin: "answer" as const,
        status,
        note: null,
      },
    ],
  };
}
