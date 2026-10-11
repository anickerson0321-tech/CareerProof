import "server-only";
import { createClient } from "@/lib/supabase/server";
import { runStructured } from "@/lib/ai/run";
import { generationRequest, postProcessGeneration } from "@/lib/ai/tasks/generate-resume";
import { applyFactCheck, factCheckRequest, linesToCheck } from "@/lib/ai/tasks/fact-check";
import { ApiError, notFound } from "@/lib/api/respond";
import { loadApplication } from "@/lib/applications/service";
import { currentYearMonth } from "@/lib/dates/parse";
import { buildRequirementViews } from "@/lib/matching/view";
import { factsMap } from "@/lib/guard/truth-guard";
import { resumeContentSchema, type ResumeContent } from "@/lib/render/model";
import type { Database, Json } from "@/lib/supabase/database.types";

const asJson = (content: ResumeContent) => content as unknown as NonNullable<Json>;
import type { Fact, PageTarget } from "@/lib/domain";
import { applyOp, OpError, type DocumentOp } from "./ops";

export interface ResumeDocument {
  id: string;
  version: number;
  page_target: PageTarget;
  content: ResumeContent;
}

export function guardMap(facts: Fact[]) {
  return factsMap(facts.map((f) => ({ id: f.id, code: f.code, status: f.status, text: f.text })));
}

/** Generate → code guard → AI fact-check → save as a new version. */
export async function generateResume(
  userId: string,
  applicationId: string,
  pageTarget: PageTarget,
  signal?: AbortSignal,
): Promise<ResumeDocument> {
  const data = await loadApplication(applicationId);
  if (!data) throw notFound("That application");
  const confirmedFacts = data.facts.filter((f) => f.status === "confirmed");
  if (confirmedFacts.length === 0) {
    throw new ApiError(409, "nothing_confirmed", "Your vault has no confirmed facts yet. Confirm your facts first, then write your resume.");
  }
  if (!data.jobs.some((j) => j.status === "confirmed")) {
    throw new ApiError(409, "no_confirmed_jobs", "None of your jobs are confirmed yet. Confirm your work history in your vault first.");
  }

  const asOf = currentYearMonth();
  const views = buildRequirementViews(data.requirements, data.facts, data.jobs, asOf);
  const input = {
    application: { title: data.application.title, employer: data.application.employer },
    requirements: views.map((v) => ({ code: v.req.code, text: v.req.text, kind: v.req.kind, status: v.status })),
    jobs: data.jobs,
    facts: data.facts,
    pageTarget,
    asOf,
  };

  const raw = await runStructured(userId, generationRequest(input, signal));
  let content = postProcessGeneration(raw, input);

  // Separate fact-check pass. If it fails, lines stay unchecked rather than blocking.
  const factById = new Map(data.facts.map((f) => [f.id, { code: f.code, text: f.text }]));
  const lines = linesToCheck(content, factById);
  if (lines.length > 0) {
    try {
      const check = await runStructured(userId, factCheckRequest(lines, signal));
      content = applyFactCheck(content, lines, check);
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }

  const supabase = await createClient();
  const { data: latest } = await supabase
    .from("documents")
    .select("version")
    .eq("application_id", applicationId)
    .eq("kind", "resume")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = (latest?.version ?? 0) + 1;

  const { data: saved, error } = await supabase
    .from("documents")
    .insert({
      user_id: userId,
      application_id: applicationId,
      kind: "resume",
      version,
      page_target: pageTarget,
      content: asJson(content),
    })
    .select("id, version, page_target")
    .single();
  if (error || !saved) throw new ApiError(500, "save_failed", "We wrote your resume but couldn't save it. Please try again.");
  return { id: saved.id, version: saved.version, page_target: saved.page_target ?? pageTarget, content };
}

export async function loadLatestResume(applicationId: string): Promise<ResumeDocument | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("documents")
    .select("id, version, page_target, content")
    .eq("application_id", applicationId)
    .eq("kind", "resume")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const parsed = resumeContentSchema.safeParse(data.content);
  if (!parsed.success) return null;
  return { id: data.id, version: data.version, page_target: data.page_target ?? "one_if_possible", content: parsed.data };
}

/** Apply one change to a resume document, validated against the person's current facts. */
export async function updateResume(documentId: string, op: DocumentOp): Promise<ResumeDocument> {
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("id, version, page_target, content, kind")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc || doc.kind !== "resume") throw notFound("That resume");
  const parsed = resumeContentSchema.safeParse(doc.content);
  if (!parsed.success) throw new ApiError(500, "bad_document", "This resume couldn't be read. Write it again from the Resume tab.");

  const { data: facts } = await supabase.from("facts").select("id, code, status, text");
  let content: ResumeContent;
  try {
    content = applyOp(parsed.data, op, guardMap((facts ?? []) as Fact[]));
  } catch (error) {
    if (error instanceof OpError) throw new ApiError(422, "not_allowed", error.message);
    throw error;
  }

  const update: Database["public"]["Tables"]["documents"]["Update"] =
    op.op === "page-target" ? { page_target: op.pageTarget } : { content: asJson(content) };
  const { error } = await supabase.from("documents").update(update).eq("id", documentId);
  if (error) throw new ApiError(500, "save_failed", "We couldn't save that change. Please try again.");
  return {
    id: doc.id,
    version: doc.version,
    page_target: op.op === "page-target" ? op.pageTarget : (doc.page_target ?? "one_if_possible"),
    content,
  };
}
