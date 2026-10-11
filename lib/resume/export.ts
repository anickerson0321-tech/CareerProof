import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ApiError, notFound } from "@/lib/api/respond";
import { buildResumeExport, exportFilename, type ExportBuild } from "@/lib/render/export-model";
import { resumeContentSchema } from "@/lib/render/model";
import { fitResume, type FitResult } from "@/lib/render/fit";
import { renderResumeDocx, renderLetterDocx } from "@/lib/render/docx";
import { letterParagraphs, renderLetterPdf } from "@/lib/render/pdf";
import type { Fact, Job, PageTarget } from "@/lib/domain";
import { z } from "zod";

// Everything a download needs, rebuilt on the server from the stored document
// and the person's current vault. Truth Guard and page fitting run here every
// time; nothing the browser says is trusted.

export const letterContentSchema = z.object({ text: z.string() });

async function loadDocument(documentId: string) {
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("id, kind, version, page_target, content, application_id, applications(title, employer)")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) throw notFound("That document");
  const [{ data: facts }, { data: jobs }, { data: profile }] = await Promise.all([
    supabase.from("facts").select("id, code, type, job_id, text, source_passage, origin, status, note"),
    supabase.from("jobs").select("id, code, employer, title, location, start_date, end_date, dates_uncertain, status"),
    supabase.from("profiles").select("full_name, email, phone, location").single(),
  ]);
  return {
    doc,
    facts: (facts ?? []) as Fact[],
    jobs: (jobs ?? []) as Job[],
    profile: profile ?? { full_name: null, email: null, phone: null, location: null },
    employer: doc.applications?.employer ?? "",
  };
}

export interface ResumeExportPlan {
  build: ExportBuild;
  fit: FitResult;
  pageTarget: PageTarget;
  employer: string;
  name: string | null;
}

export async function planResumeExport(documentId: string): Promise<ResumeExportPlan> {
  const { doc, facts, jobs, profile, employer } = await loadDocument(documentId);
  if (doc.kind !== "resume") throw new ApiError(400, "wrong_kind", "That isn't a resume.");
  const parsed = resumeContentSchema.safeParse(doc.content);
  if (!parsed.success) throw new ApiError(500, "bad_document", "This resume couldn't be read. Write it again from the Resume tab.");
  const build = buildResumeExport(parsed.data, facts, jobs, profile);
  const pageTarget = doc.page_target ?? "one_if_possible";
  const fit = await fitResume(build.model, pageTarget);
  return { build, fit, pageTarget, employer, name: profile.full_name };
}

export interface ExportFile {
  body: Uint8Array;
  contentType: string;
  filename: string;
  pages: number | null;
}

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function exportDocument(documentId: string, format: "docx" | "pdf"): Promise<ExportFile> {
  const { doc, profile, employer } = await loadDocument(documentId);

  if (doc.kind === "cover_letter") {
    const parsed = letterContentSchema.safeParse(doc.content);
    const text = parsed.success ? parsed.data.text.trim() : "";
    if (!text) throw new ApiError(422, "empty_letter", "This cover letter is empty. Write it first.");
    const model = {
      name: profile.full_name?.trim() || "Your name",
      contactLine: [profile.location, profile.phone, profile.email].filter((v) => v && v.trim()).join("  ·  "),
      date: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
      text,
    };
    const body = format === "pdf" ? await renderLetterPdf(model) : await renderLetterDocx(model, letterParagraphs(text));
    return {
      body,
      contentType: format === "pdf" ? "application/pdf" : DOCX,
      filename: exportFilename(profile.full_name, employer, format, "Cover Letter"),
      pages: null,
    };
  }

  const plan = await planResumeExport(documentId);
  if (plan.pageTarget === "strict_one" && !plan.fit.fits) {
    throw new DoesNotFitError(plan.fit.note ?? "This doesn't fit on one page.", plan.fit.cuts);
  }
  const body = format === "pdf" ? plan.fit.pdf : await renderResumeDocx(plan.build.model, plan.fit.step);
  return {
    body,
    contentType: format === "pdf" ? "application/pdf" : DOCX,
    filename: exportFilename(profile.full_name, employer, format),
    pages: plan.fit.pages,
  };
}

export class DoesNotFitError extends Error {
  constructor(
    message: string,
    readonly cuts: { id: string; text: string }[],
  ) {
    super(message);
  }
}
