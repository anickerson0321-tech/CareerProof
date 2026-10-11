import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle, parseJson, requireApiUser } from "@/lib/api/respond";
import { extractFromFile, fromText, type ExtractionResult } from "@/lib/extract/extract";
import { MAX_FILE_BYTES, MAX_RESUME_CHARS } from "@/lib/extract/detect";
import { createClient } from "@/lib/supabase/server";

// Upload (multipart "file") or paste (JSON { text }) → stored original +
// extracted text + warnings. Nothing is sent to the AI here.

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
};

const pasteSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Paste your resume text first.")
    .max(MAX_RESUME_CHARS, `That's more than ${MAX_RESUME_CHARS.toLocaleString("en-US")} characters. Remove anything that isn't your resume and try again.`),
});

export const POST = handle(async (request: NextRequest) => {
  const user = await requireApiUser();
  const supabase = await createClient();
  const contentType = request.headers.get("content-type") ?? "";

  let result: ExtractionResult;
  let filename: string | null = null;
  let storagePath: string | null = null;
  let sizeBytes: number | null = null;

  if (contentType.startsWith("multipart/form-data")) {
    // Refuse oversized uploads before reading the body into memory.
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (!declared) throw new ApiError(411, "length_required", "The upload didn't say how big it was. Please try again.");
    if (declared > MAX_FILE_BYTES + 64 * 1024) {
      throw new ApiError(413, "file_too_large", "That file is over 5 MB. Save a smaller copy (remove images), or paste your resume instead.");
    }
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "no_file", "Choose a file to upload.");
    if (file.size === 0) throw new ApiError(400, "empty_file", "That file is empty. Choose another, or paste your resume instead.");
    if (file.size > MAX_FILE_BYTES) {
      throw new ApiError(413, "file_too_large", "That file is over 5 MB. Save a smaller copy (remove images), or paste your resume instead.");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    filename = file.name.slice(0, 200);
    sizeBytes = file.size;
    result = await extractFromFile(bytes, filename);

    if (!result.blocking) {
      const ext = result.kind === "pdf" ? "pdf" : result.kind === "docx" ? "docx" : "txt";
      storagePath = `${user.id}/${randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("resumes")
        .upload(storagePath, bytes, { contentType: MIME[ext], upsert: false });
      if (error) throw new ApiError(500, "upload_failed", "We couldn't save your file just now. Please try again.");
    }
  } else {
    const { text } = await parseJson(request, pasteSchema);
    result = fromText(text);
  }

  if (result.blocking) {
    return NextResponse.json({ sourceDocumentId: null, text: result.text.slice(0, 5000), warnings: result.warnings, blocking: true });
  }

  const { data, error } = await supabase
    .from("source_documents")
    .insert({
      user_id: user.id,
      storage_path: storagePath,
      filename,
      mime_type: storagePath ? MIME[storagePath.split(".").pop()!] : "text/plain",
      size_bytes: sizeBytes,
      extracted_text: result.text,
      extraction_warnings: result.warnings as never,
    })
    .select("id")
    .single();
  if (error || !data) throw new ApiError(500, "save_failed", "We read your resume but couldn't save it. Please try again.");

  return NextResponse.json({ sourceDocumentId: data.id, text: result.text, warnings: result.warnings, blocking: false });
});
