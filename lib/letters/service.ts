import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ApiError, notFound } from "@/lib/api/respond";
import { letterContentSchema } from "@/lib/resume/export";

export interface LetterDocument {
  id: string;
  version: number;
  text: string;
}

export const letterEditSchema = z.object({
  op: z.literal("letter-edit"),
  text: z.string().max(8000, "Keep the letter under 8,000 characters."),
});

export async function loadLatestLetter(applicationId: string): Promise<LetterDocument | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("documents")
    .select("id, version, content")
    .eq("application_id", applicationId)
    .eq("kind", "cover_letter")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const parsed = letterContentSchema.safeParse(data.content);
  return { id: data.id, version: data.version, text: parsed.success ? parsed.data.text : "" };
}

export async function updateLetter(documentId: string, text: string): Promise<LetterDocument> {
  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("id, version, kind").eq("id", documentId).maybeSingle();
  if (!doc || doc.kind !== "cover_letter") throw notFound("That cover letter");
  const { error } = await supabase.from("documents").update({ content: { text } }).eq("id", documentId);
  if (error) throw new ApiError(500, "save_failed", "We couldn't save your letter. Please try again.");
  return { id: doc.id, version: doc.version, text };
}
