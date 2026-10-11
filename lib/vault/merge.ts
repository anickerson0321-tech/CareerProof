import type { CleanExtraction, CleanFact, CleanJob } from "@/lib/ai/tasks/extract-resume";
import type { FactStatus, JobStatus } from "@/lib/domain";
import { jobIdentity, normalizeText } from "./normalize";

// Re-import merge (SPEC 4.3): recognize existing facts by normalized text and
// existing jobs by employer + title. Never duplicate, never overwrite anything
// already in the vault (confirmed or not), never resurrect a removed fact.

export interface ExistingJob {
  id: string;
  employer: string;
  title: string;
  status: JobStatus;
  /** Employer + title identities from before the person edited the job. */
  previous_identities?: string[];
}

export interface ExistingFact {
  id: string;
  normalized_text: string;
  status: FactStatus;
  job_id: string | null;
}

export interface MergePlan {
  /** New jobs to insert, keyed by the extraction key. */
  newJobs: CleanJob[];
  /** Extraction job key → existing job id. */
  matchedJobs: Record<string, string>;
  newFacts: (CleanFact & { normalized_text: string })[];
  /** How many extracted facts were already in the vault. */
  alreadyInVault: number;
  /** How many were skipped because the user removed them before. */
  previouslyRemoved: number;
}

export interface PreviousFactText {
  fact_id: string;
  previous_text: string;
}

export function planMerge(
  extraction: CleanExtraction,
  jobs: ExistingJob[],
  facts: ExistingFact[],
  /** Wording of facts before the person edited them: the original resume still says it that way. */
  revisions: PreviousFactText[] = [],
): MergePlan {
  const existingJobByIdentity = new Map<string, string>();
  for (const j of jobs) {
    for (const identity of j.previous_identities ?? []) existingJobByIdentity.set(identity, j.id);
  }
  // Current names win over old ones.
  for (const j of jobs) existingJobByIdentity.set(jobIdentity(j.employer, j.title), j.id);
  const matchedJobs: Record<string, string> = {};
  const newJobs: CleanJob[] = [];
  const newIdentities = new Set<string>();

  for (const job of extraction.jobs) {
    const identity = jobIdentity(job.employer, job.title);
    const existing = existingJobByIdentity.get(identity);
    if (existing) {
      matchedJobs[job.key] = existing;
    } else if (!newIdentities.has(identity)) {
      newIdentities.add(identity);
      newJobs.push(job);
    } else {
      // Same job listed twice in one resume: point the second key at the first.
      const first = newJobs.find((j) => jobIdentity(j.employer, j.title) === identity)!;
      matchedJobs[job.key] = `new:${first.key}`;
    }
  }

  const known = new Map<string, FactStatus>();
  for (const f of facts) {
    const prev = known.get(f.normalized_text);
    // A removed copy wins so it's never brought back.
    if (!prev || f.status === "unsupported") known.set(f.normalized_text, f.status);
  }
  // A fact the person corrected ("12" → "9") must not come back in its old wording.
  const statusById = new Map(facts.map((f) => [f.id, f.status]));
  for (const r of revisions) {
    const status = statusById.get(r.fact_id);
    const key = normalizeText(r.previous_text);
    if (!status || !key) continue;
    const prev = known.get(key);
    if (!prev || status === "unsupported") known.set(key, status);
  }

  const newFacts: MergePlan["newFacts"] = [];
  const batch = new Set<string>();
  let alreadyInVault = 0;
  let previouslyRemoved = 0;

  for (const fact of extraction.facts) {
    const normalized = normalizeText(fact.text);
    if (!normalized) continue;
    const status = known.get(normalized);
    if (status === "unsupported") {
      previouslyRemoved++;
      continue;
    }
    if (status) {
      alreadyInVault++;
      continue;
    }
    if (batch.has(normalized)) continue;
    batch.add(normalized);
    newFacts.push({ ...fact, normalized_text: normalized });
  }

  return { newJobs, matchedJobs, newFacts, alreadyInVault, previouslyRemoved };
}

/** Fill only empty profile fields; never overwrite what the user has. */
export function profileUpdates(
  current: Partial<Record<"full_name" | "email" | "phone" | "location" | "headline", string | null>>,
  extracted: CleanExtraction["profile"],
) {
  const updates: Partial<Record<"full_name" | "phone" | "location" | "headline", string>> = {};
  const pairs: ["full_name" | "phone" | "location" | "headline", string | null][] = [
    ["full_name", extracted.name],
    ["phone", extracted.phone],
    ["location", extracted.location],
    ["headline", extracted.headline],
  ];
  for (const [field, value] of pairs) {
    if (value && !current[field]?.trim()) updates[field] = value;
  }
  return updates;
}
