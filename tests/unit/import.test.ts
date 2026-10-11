import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cleanText } from "@/lib/extract/detect";
import { fixtureKey } from "@/lib/ai/fixture-key";
import { extractionSchema, postProcessExtraction, type CleanExtraction, type Extraction } from "@/lib/ai/tasks/extract-resume";
import { planMerge, profileUpdates, type ExistingFact, type ExistingJob } from "@/lib/vault/merge";
import { jobIdentity, normalizeText } from "@/lib/vault/normalize";
import { experienceFor } from "@/lib/dates/intervals";
import { checkYearsClaim } from "@/lib/vault/summary-claims";

// Runs every fixture resume through the recorded AI response, the code
// post-processing and the merge into an empty vault: SPEC M2 acceptance.

const root = join(__dirname, "..", "fixtures");
const asOf = { year: 2026, month: 10 };

function load(name: string): { raw: Extraction; clean: CleanExtraction } {
  const text = cleanText(readFileSync(join(root, "resumes", `${name}.txt`), "utf8"));
  const file = join(root, "ai", "extract_resume", `${fixtureKey(text)}.json`);
  expect(existsSync(file), `recorded response for ${name} (${fixtureKey(text)})`).toBe(true);
  const raw = extractionSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  return { raw, clean: postProcessExtraction(raw) };
}

const ofType = (x: CleanExtraction, type: string) => x.facts.filter((f) => f.type === type);
const CONTACT = /@|\(\d{3}\)|\d{3}-\d{3}-\d{4}|linkedin|github\.com/i;

describe.each(["custodial-lead", "career-changer", "new-grad", "skills-table", "scanned-ocr"])("%s", (name) => {
  const { clean } = load(name);

  it("keeps contact details out of facts", () => {
    for (const f of clean.facts) expect(f.text, f.text).not.toMatch(CONTACT);
  });

  it("has valid, sorted job dates", () => {
    for (const job of clean.jobs) {
      expect(job.start_date).toMatch(/^(\d{4}(-\d{2})?|present)$/);
      expect(job.end_date).toMatch(/^(\d{4}(-\d{2})?|present)$/);
    }
  });

  it("keeps skills separate from duties", () => {
    for (const skill of ofType(clean, "skill")) {
      expect(skill.jobKey).toBeNull();
      expect(skill.text.split(" ").length).toBeLessThanOrEqual(6);
    }
    for (const duty of ofType(clean, "duty")) expect(duty.jobKey).not.toBeNull();
  });

  it("states education completion plainly", () => {
    for (const edu of ofType(clean, "education")) {
      expect(edu.text, edu.text).toMatch(/Completed|In progress|not completed|Completion not stated/);
    }
  });

  it("limits source passages to 25 words", () => {
    for (const f of clean.facts) expect((f.source_passage ?? "").split(/\s+/).length).toBeLessThanOrEqual(26);
  });

  it("imports into an empty vault without duplicates", () => {
    const plan = planMerge(clean, [], []);
    expect(plan.newJobs.length).toBe(clean.jobs.length);
    expect(plan.newFacts.length).toBe(new Set(clean.facts.map((f) => normalizeText(f.text))).size);
    expect(plan.alreadyInVault).toBe(0);
  });
});

describe("fixture specifics", () => {
  it("custodial lead: 3 jobs, newest first, certifications vs training, unfinished coursework", () => {
    const { clean } = load("custodial-lead");
    expect(clean.jobs.map((j) => j.employer)).toEqual([
      "Kettering Valley Hospital",
      "Brightline Facility Services",
      "Fairborn City Schools",
    ]);
    expect(clean.jobs[0]).toMatchObject({ start_date: "2020-03", end_date: "present", dates_uncertain: false });
    expect(ofType(clean, "certification")).toHaveLength(2);
    expect(ofType(clean, "training")).toHaveLength(2);
    expect(ofType(clean, "skill")).toHaveLength(7);
    expect(ofType(clean, "summary_claim")).toHaveLength(2);
    const coursework = ofType(clean, "education").find((f) => f.text.includes("Sinclair"));
    expect(coursework?.text).toContain("not completed");
    expect(coursework?.text).not.toMatch(/\bCompleted 20/);

    // Rule 9: "9+ years" is checked against the dates (2014 – present, counted conservatively).
    const exp = experienceFor(
      clean.jobs.map((j) => ({ id: j.key, ...j })),
      asOf,
    );
    expect(checkYearsClaim("9+ years of experience", exp)?.ok).toBe(true);
  });

  it("career changer: degree in progress stays in progress", () => {
    const { clean } = load("career-changer");
    const med = ofType(clean, "education").find((f) => f.text.startsWith("M.Ed."));
    expect(med?.text).toContain("In progress, expected December 2026");
    expect(clean.jobs).toHaveLength(2);
    expect(clean.profile.headline).toContain("Instructional Designer");
  });

  it("new grad: internships with an uncertain season date; part-time job sorts first", () => {
    const { clean } = load("new-grad");
    expect(clean.jobs[0]?.title).toBe("Barista (part-time)");
    const intern = clean.jobs.find((j) => j.employer === "Delta Logistics Co.");
    expect(intern).toMatchObject({ start_date: "2025-06", end_date: "2025-08", dates_uncertain: true });
    expect(clean.warnings[0]).toContain("Summer 2025");
    expect(ofType(clean, "skill")).toHaveLength(10);
  });

  it("skills table: one fact per skill from every column", () => {
    const { clean } = load("skills-table");
    const skills = ofType(clean, "skill").map((f) => f.text);
    expect(skills).toEqual(expect.arrayContaining(["Phlebotomy", "Insurance verification", "Epic EHR", "Microsoft Outlook"]));
    expect(skills).toHaveLength(13);
    expect(clean.jobs[1]).toMatchObject({ start_date: "2018", end_date: "2021-03" });
  });

  it("scanned text: warnings are passed on and unreadable contact info is left out", () => {
    const { clean } = load("scanned-ocr");
    expect(clean.warnings.length).toBeGreaterThan(0);
    expect(clean.profile.phone).toBeNull();
  });
});

describe("post-processing guards", () => {
  const base: Extraction = {
    profile: { name: " Ana ", email: null, phone: null, location: null, headline: "" },
    jobs: [
      { key: "j1", employer: "Acme", title: "Clerk", location: null, start: "June 2019", end: "2021-13", datesUncertain: false },
      { key: "j1", employer: "Dup", title: "Dup", location: null, start: "2019", end: "2020", datesUncertain: false },
    ],
    facts: [
      { type: "duty", jobKey: "j1", text: "Filed  records.", source: "word ".repeat(40), note: "" },
      { type: "duty", jobKey: "j9", text: "Answered phones.", source: "x", note: null },
      { type: "skill", jobKey: "j1", text: "Excel", source: "Excel", note: null },
      { type: "other", jobKey: null, text: "ana@example.com", source: "x", note: null },
      { type: "other", jobKey: null, text: "Call (555) 123-4567", source: "x", note: null },
    ],
    warnings: ["  ", "Dates unclear"],
  };
  const clean = postProcessExtraction(base);

  it("drops unreadable dates and flags them", () => {
    expect(clean.jobs).toHaveLength(1);
    expect(clean.jobs[0]).toMatchObject({ start_date: null, end_date: null, dates_uncertain: true });
  });

  it("drops contact details, unknown job keys and long sources", () => {
    expect(clean.facts.map((f) => f.text)).toEqual(["Filed records.", "Answered phones.", "Excel"]);
    expect(clean.facts[1]?.jobKey).toBeNull();
    expect(clean.facts[2]?.jobKey).toBeNull();
    expect(clean.facts[0]?.source_passage?.split(" ").length).toBe(25);
    expect(clean.facts[0]?.note).toBeNull();
  });

  it("trims profile and warnings", () => {
    expect(clean.profile.name).toBe("Ana");
    expect(clean.profile.headline).toBeNull();
    expect(clean.warnings).toEqual(["Dates unclear"]);
  });
});

describe("re-import merge", () => {
  const { clean } = load("custodial-lead");
  const jobs: ExistingJob[] = clean.jobs.map((j, i) => ({ id: `job-${i}`, employer: j.employer, title: j.title, status: "confirmed" }));
  const facts: ExistingFact[] = clean.facts.map((f, i) => ({
    id: `fact-${i}`,
    normalized_text: normalizeText(f.text),
    status: "confirmed",
    job_id: null,
  }));

  it("importing the same resume again adds nothing", () => {
    const plan = planMerge(clean, jobs, facts);
    expect(plan.newJobs).toEqual([]);
    expect(plan.newFacts).toEqual([]);
    expect(plan.alreadyInVault).toBe(clean.facts.length);
    expect(Object.keys(plan.matchedJobs)).toHaveLength(3);
  });

  it("recognizes jobs and facts despite case, punctuation and company suffixes", () => {
    const changed: CleanExtraction = {
      ...clean,
      jobs: [{ ...clean.jobs[0]!, employer: "KETTERING VALLEY HOSPITAL, Inc.", key: "x1" }],
      facts: [
        { ...clean.facts[2]!, jobKey: "x1", text: clean.facts[2]!.text.toUpperCase().replace(/\.$/, "") },
        { type: "accomplishment", jobKey: "x1", text: "Passed 3 Joint Commission surveys with no findings.", source_passage: null, note: null },
      ],
    };
    const plan = planMerge(changed, jobs, facts);
    expect(plan.newJobs).toEqual([]);
    expect(plan.matchedJobs).toEqual({ x1: "job-0" });
    expect(plan.newFacts.map((f) => f.text)).toEqual(["Passed 3 Joint Commission surveys with no findings."]);
    expect(plan.alreadyInVault).toBe(1);
  });

  it("never brings back a fact the user removed", () => {
    const removed = facts.map((f, i) => (i === 0 ? { ...f, status: "unsupported" as const } : f));
    const plan = planMerge(clean, jobs, removed);
    expect(plan.previouslyRemoved).toBe(1);
    expect(plan.newFacts).toEqual([]);
  });

  it("doesn't bring back a fact's old wording after the person corrected it", () => {
    const original = clean.facts.find((f) => /Trained 9 new hires/.test(f.text))!;
    const idx = clean.facts.indexOf(original);
    const corrected = facts.map((f, i) => (i === idx ? { ...f, normalized_text: normalizeText("Trained nine new hires on PPE.") } : f));
    expect(planMerge(clean, jobs, corrected).newFacts.map((f) => f.text)).toEqual([original.text]);
    const plan = planMerge(clean, jobs, corrected, [{ fact_id: `fact-${idx}`, previous_text: original.text }]);
    expect(plan.newFacts).toEqual([]);
  });

  it("recognizes a job the person renamed", () => {
    const renamed = jobs.map((j, i) =>
      i === 0 ? { ...j, title: "Environmental Services Lead", previous_identities: [jobIdentity(j.employer, j.title)] } : j,
    );
    const plan = planMerge(clean, renamed, facts);
    expect(plan.newJobs).toEqual([]);
    expect(plan.matchedJobs[clean.jobs[0]!.key]).toBe("job-0");
  });

  it("different numbers are different facts", () => {
    expect(normalizeText("Trained 9 new hires.")).not.toBe(normalizeText("Trained 12 new hires."));
    expect(normalizeText("Cut costs by 15%.")).toBe(normalizeText("cut costs by 15%"));
    expect(jobIdentity("The Acme Company", "Clerk")).toBe(jobIdentity("Acme", "clerk"));
  });

  it("fills only empty profile fields", () => {
    expect(
      profileUpdates({ full_name: "Denise O.", phone: "", location: null, headline: null }, clean.profile),
    ).toEqual({ phone: "(555) 201-7744", location: "Dayton, OH" });
  });
});
