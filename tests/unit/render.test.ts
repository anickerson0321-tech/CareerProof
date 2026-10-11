import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildResumeExport, cutCandidates, exportFilename, withoutBullets, type ExportResume } from "@/lib/render/export-model";
import { fitResume } from "@/lib/render/fit";
import { countPdfPages, renderLetterPdf, renderResumePdf, letterParagraphs } from "@/lib/render/pdf";
import { renderLetterDocx, renderResumeDocx } from "@/lib/render/docx";
import { LAYOUT_STEPS, layoutLabel } from "@/lib/render/layout";
import { generationRequest, generationSchema, postProcessGeneration } from "@/lib/ai/tasks/generate-resume";
import { applyOp } from "@/lib/resume/ops";
import { factsMap } from "@/lib/guard/truth-guard";
import { deniseAfterAnswer } from "../support/fixture-application";
import { readFixture } from "../support/fixture-vault";

const asOf = { year: 2026, month: 10 };
const { input, vault } = deniseAfterAnswer(asOf);
const profile = { full_name: "Denise Okafor", email: "denise.okafor@example.com", phone: "(555) 201-7744", location: "Dayton, OH" };

function generated() {
  const raw = generationSchema.parse(JSON.parse(readFixture("ai", "generate_resume", `${generationRequest(input).fixtureKey}.json`)));
  return postProcessGeneration(raw, input);
}

/** A model padded with extra lines, to test page limits. */
function padded(base: ExportResume, extra: number): ExportResume {
  const filler = Array.from({ length: extra }, (_, i) => ({
    id: `x${i}`,
    text: `Kept patient rooms, hallways and public restrooms clean and stocked on every overnight shift, following checklist item ${i + 1}.`,
    relevance: 1 as const,
    addressesRequirement: false,
  }));
  return { ...base, jobs: base.jobs.map((j, i) => (i === 0 ? { ...j, bullets: [...j.bullets, ...filler] } : j)) };
}

describe("export model (server-side Truth Guard)", () => {
  it("leaves out lines that need a look, unchecked lines and unconfirmed jobs", () => {
    const content = applyOp(generated(), { op: "include", bulletId: "b10", included: false }, factsMap([]));
    const jobs = vault.jobs.map((j) => (j.code === "j3" ? { ...j, status: "pending" as const } : j));
    const build = buildResumeExport(content, vault.facts, jobs, profile);
    const texts = build.model.jobs.flatMap((j) => j.bullets.map((b) => b.text));
    expect(texts).not.toContain("Trained 12 new hires on chemical safety, PPE and isolation-room cleaning.");
    expect(texts).not.toContain("Managed supply ordering and inventory for the overnight shift.");
    expect(build.heldBack).toBe(2);
    expect(build.model.jobs.map((j) => j.title)).toEqual(["Lead Custodian", "Custodian"]);
    expect(build.unconfirmedJobs).toBe(1);
    expect(build.model.summary).not.toBeNull();
    expect(build.model.skills).toHaveLength(6);
    expect(build.model.education).toHaveLength(2);
  });

  it("never includes a line whose fact was un-confirmed after it was reviewed", () => {
    const guard = factsMap(vault.facts.map((f) => ({ id: f.id, code: f.code, status: f.status, text: f.text })));
    const reviewed = applyOp(generated(), { op: "review", bulletId: "b6" }, guard);
    const unconfirmed = vault.facts.map((f) => (f.code === "E23" ? { ...f, status: "pending" as const } : f));
    const texts = buildResumeExport(reviewed, unconfirmed, vault.jobs, profile).model.jobs.flatMap((j) => j.bullets.map((b) => b.text));
    expect(texts).not.toContain("Managed supply ordering and inventory for the overnight shift.");
  });

  it("omits a failing summary", () => {
    const content = generated();
    const bad = { ...content, summary: { ...content.summary!, fact_ids: [] } };
    const build = buildResumeExport(bad, vault.facts, vault.jobs, profile);
    expect(build.model.summary).toBeNull();
    expect(build.summaryOmitted).toBe(true);
  });

  it("names files after the person and employer", () => {
    expect(exportFilename("Jordan Rivera", "Mercy Valley Health", "docx")).toBe("Jordan Rivera - Mercy Valley Health.docx");
    expect(exportFilename("Jordan Rivera", "Mercy Valley Health", "pdf", "Cover Letter")).toBe("Jordan Rivera - Mercy Valley Health - Cover Letter.pdf");
    expect(exportFilename("A/B: C", "", "pdf")).toBe("A B C.pdf");
  });
});

describe("page fitting", () => {
  const base = buildResumeExport(generated(), vault.facts, vault.jobs, profile).model;

  it("a normal resume fits on one page at the largest layout, measured from the real PDF", async () => {
    const fit = await fitResume(base, "strict_one");
    expect(fit).toMatchObject({ fits: true, pages: 1, step: LAYOUT_STEPS[0], cuts: [] });
    expect(fit.label).toBe('1 page · 10.5pt text, 0.75" margins');
    expect(await countPdfPages(fit.pdf)).toBe(1);
  });

  it("steps down the layout ladder before giving up", async () => {
    // Find a size that needs a smaller layout but still fits on one page.
    for (let extra = 4; extra < 40; extra += 2) {
      const fit = await fitResume(padded(base, extra), "strict_one");
      if (fit.fits && fit.step !== LAYOUT_STEPS[0]) {
        expect(LAYOUT_STEPS.indexOf(fit.step)).toBeGreaterThan(0);
        return;
      }
    }
    throw new Error("No padding needed a smaller layout");
  }, 120_000);

  it("strict one page: suggests the least important lines to cut, and removing them fits", async () => {
    const big = padded(base, 30);
    const fit = await fitResume(big, "strict_one");
    expect(fit.fits).toBe(false);
    expect(fit.cuts.length).toBeGreaterThan(0);
    // Least relevant lines that address no requirement go first, older roles before recent ones.
    const lowValue = new Set(cutCandidates(big).filter((b) => b.relevance === 1 && !b.addressesRequirement).map((b) => b.id));
    expect(fit.cuts.every((c) => lowValue.has(c.id))).toBe(true);
    expect(fit.cuts[0]?.text).toBe("Operated auto-scrubbers and floor burnishers to strip and refinish floors.");
    const after = withoutBullets(big, new Set(fit.cuts.map((c) => c.id)));
    expect((await fitResume(after, "strict_one")).fits).toBe(true);
  }, 120_000);

  it("one page if possible: falls back to two pages with a note", async () => {
    const fit = await fitResume(padded(base, 30), "one_if_possible");
    expect(fit.pages).toBe(2);
    expect(fit.note).toMatch(/two pages/);
  }, 120_000);

  it("orders cut candidates: least relevant, no requirement, older roles and later lines first", () => {
    const order = cutCandidates(base).map((b) => b.text);
    // Relevance 1 and addressing no requirement, from the oldest role that has one.
    expect(order[0]).toBe("Operated auto-scrubbers and floor burnishers to strip and refinish floors.");
    expect(order[1]).toBe("Complete daily cleaning checklists and report maintenance problems through the work order system.");
    expect(order[order.length - 1]).toMatch(/^Lead a crew of 6/);
  });

  it("labels never go below 10pt or 0.5 inch", () => {
    for (const step of LAYOUT_STEPS) {
      expect(step.body).toBeGreaterThanOrEqual(10);
      expect(step.margin).toBeGreaterThanOrEqual(0.5);
    }
    expect(layoutLabel(LAYOUT_STEPS[1]!, 1)).toBe('1 page · 10.5pt text, 0.6" margins');
  });
});

const soffice = ["/usr/bin/soffice", "/usr/bin/libreoffice", "/Applications/LibreOffice.app/Contents/MacOS/soffice"].find(existsSync);

/** Lay out a .docx with LibreOffice (a stand-in for Word) and count its pages. */
async function docxPages(docx: Buffer): Promise<number> {
  const dir = mkdtempSync(join(tmpdir(), "cp-docx-"));
  try {
    writeFileSync(join(dir, "resume.docx"), docx);
    execFileSync(soffice!, ["--headless", "--convert-to", "pdf", "--outdir", dir, join(dir, "resume.docx")], { stdio: "ignore", timeout: 120_000 });
    return countPdfPages(readFileSync(join(dir, "resume.pdf")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe.skipIf(!soffice)("Word and PDF page counts match (DOCX laid out by LibreOffice)", () => {
  const base = buildResumeExport(generated(), vault.facts, vault.jobs, profile).model;

  it.each(LAYOUT_STEPS.map((s, i) => [i, s] as const))(
    "a PDF that exactly fills one page stays one page in Word (step %i)",
    async (_i, step) => {
      // The fullest one-page PDF at this step.
      let extra = 0;
      while ((await countPdfPages(await renderResumePdf(padded(base, extra + 1), step))) === 1) extra++;
      const model = padded(base, extra);
      expect(await countPdfPages(await renderResumePdf(model, step))).toBe(1);
      expect(await docxPages(await renderResumeDocx(model, step))).toBe(1);
    },
    240_000,
  );

  it("cover letters are one page in both formats", async () => {
    const text = sampleLetter;
    const model = { name: "Denise Okafor", contactLine: "Dayton, OH  ·  (555) 201-7744", date: "October 11, 2026", text };
    expect(await countPdfPages(await renderLetterPdf(model))).toBe(1);
    expect(await docxPages(await renderLetterDocx(model, letterParagraphs(text)))).toBe(1);
  }, 120_000);
});

const sampleLetter = `Dear Hiring Manager,

I'm applying for the Environmental Services Supervisor role at St. Brigid Medical Center. For the past six years I've led a crew of 6 custodians on the overnight shift at Kettering Valley Hospital, and I'd like to bring that experience to your team.

On my shift I build the weekly schedule and arrange coverage when someone calls off, usually 2 or 3 times a month. I've trained 9 new hires on chemical safety, PPE and isolation-room cleaning, and I hold a CHEST certification.

I'd welcome the chance to talk about how I can help keep St. Brigid's patient areas clean, safe and survey-ready.

Sincerely,
Denise Okafor`;
