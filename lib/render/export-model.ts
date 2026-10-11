import type { Fact, Job } from "@/lib/domain";
import { checkLine, factsMap } from "@/lib/guard/truth-guard";
import { currentYearMonth, endDateSortKey, type YearMonth } from "@/lib/dates/parse";
import { experienceFor } from "@/lib/dates/intervals";
import { formatDateRange } from "@/lib/dates/format";
import type { ResumeContent } from "./model";

// The exact content that goes into a downloaded file. Built on the server from
// the stored resume and the person's CURRENT vault, re-running Truth Guard:
// only included lines that are exportable now make it in.

export interface ExportBullet {
  id: string;
  text: string;
  relevance: 1 | 2 | 3;
  addressesRequirement: boolean;
}

export interface ExportJob {
  title: string;
  employer: string;
  location: string | null;
  dates: string;
  bullets: ExportBullet[];
}

export interface ExportResume {
  name: string;
  contactLine: string;
  summary: string | null;
  jobs: ExportJob[];
  skills: string[];
  education: string[];
  certifications: string[];
}

export interface ExportProfile {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
}

export interface ExportBuild {
  model: ExportResume;
  /** Included lines held back because they still need a look. */
  heldBack: number;
  summaryOmitted: boolean;
  unconfirmedJobs: number;
}

export function buildResumeExport(
  content: ResumeContent,
  facts: Fact[],
  jobs: Job[],
  profile: ExportProfile,
  asOf: YearMonth = currentYearMonth(),
): ExportBuild {
  const guard = factsMap(facts.map((f) => ({ id: f.id, code: f.code, status: f.status, text: f.text })));
  let heldBack = 0;

  const printed = jobs
    .filter((j) => j.status === "confirmed")
    .sort((a, b) => endDateSortKey(b.end_date) - endDateSortKey(a.end_date));

  const exportJobs: ExportJob[] = printed.map((job) => {
    const section = content.jobs.find((s) => s.job_id === job.id);
    const bullets: ExportBullet[] = [];
    for (const b of section?.bullets ?? []) {
      if (!b.included) continue;
      if (!checkLine(b, guard).exportable) {
        heldBack++;
        continue;
      }
      bullets.push({ id: b.id, text: b.text, relevance: b.relevance, addressesRequirement: b.requirement_codes.length > 0 });
    }
    return {
      title: job.title,
      employer: job.employer,
      location: job.location,
      dates: formatDateRange(job.start_date, job.end_date),
      bullets,
    };
  });

  const summaryOk = content.summary ? checkLine(content.summary, guard, { experience: summaryExperience(jobs, asOf) }).exportable : false;
  const skills = content.skills
    .filter((s) => s.included && checkLine({ text: s.text, fact_ids: s.fact_ids, reviewed: false, ai_check: null }, guard, { softChecks: false }).exportable)
    .map((s) => s.text);
  const confirmedText = (type: Fact["type"]) => facts.filter((f) => f.type === type && f.status === "confirmed").map((f) => f.text);

  return {
    model: {
      name: profile.full_name?.trim() || "Your name",
      contactLine: [profile.location, profile.phone, profile.email].filter((v) => v && v.trim()).join("  ·  "),
      summary: summaryOk && content.summary ? content.summary.text : null,
      jobs: exportJobs,
      skills,
      education: confirmedText("education"),
      certifications: confirmedText("certification"),
    },
    heldBack,
    summaryOmitted: Boolean(content.summary) && !summaryOk,
    unconfirmedJobs: jobs.filter((j) => j.status !== "confirmed").length,
  };
}

/**
 * Which lines to suggest removing when a strict one-page resume won't fit:
 * least relevant first, lines that address no requirement first, older roles
 * before recent ones, later lines in a role before earlier ones.
 */
export function cutCandidates(model: ExportResume): ExportBullet[] {
  const all = model.jobs.flatMap((job, jobIndex) => job.bullets.map((b, position) => ({ b, jobIndex, position })));
  return all
    .sort(
      (x, y) =>
        x.b.relevance - y.b.relevance ||
        Number(x.b.addressesRequirement) - Number(y.b.addressesRequirement) ||
        y.jobIndex - x.jobIndex ||
        y.position - x.position,
    )
    .map((x) => x.b);
}

export function withoutBullets(model: ExportResume, ids: Set<string>): ExportResume {
  return { ...model, jobs: model.jobs.map((j) => ({ ...j, bullets: j.bullets.filter((b) => !ids.has(b.id)) })) };
}

/** "Jordan Rivera - Mercy Valley Health.docx" (SPEC §9). */
export function exportFilename(name: string | null, employer: string, ext: "docx" | "pdf", suffix?: string): string {
  const clean = (s: string) => s.replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  const parts = [clean(name || "Resume"), clean(employer) || null, suffix ?? null].filter(Boolean);
  return `${parts.join(" - ")}.${ext}`;
}

/** Years of experience the summary is checked against: confirmed jobs only. */
export function summaryExperience(jobs: Pick<Job, "id" | "start_date" | "end_date" | "dates_uncertain" | "status">[], asOf: YearMonth) {
  return experienceFor(
    jobs.filter((j) => j.status === "confirmed"),
    asOf,
  );
}
