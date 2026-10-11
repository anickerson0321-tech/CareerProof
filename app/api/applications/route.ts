import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handle, parseJson, requireApiUser } from "@/lib/api/respond";
import { createApplication } from "@/lib/applications/service";
import { MAX_POSTING_CHARS } from "@/lib/ai/tasks/analyze-posting";

export const maxDuration = 120;

const schema = z.object({
  postingText: z
    .string()
    .trim()
    .min(200, "That looks too short for a job posting. Paste the whole posting, including the requirements.")
    .max(MAX_POSTING_CHARS, `That's more than ${MAX_POSTING_CHARS.toLocaleString("en-US")} characters. Paste just the job posting.`),
  postingUrl: z
    .string()
    .trim()
    .max(2000)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^https?:\/\//i.test(v), { message: "The link should start with http:// or https://." }),
});

// Posting text → AI analysis → requirements saved. The link is kept for your
// reference only; we don't fetch it.
export const POST = handle(async (request: NextRequest) => {
  const user = await requireApiUser();
  const input = await parseJson(request, schema);
  const id = await createApplication(user.id, { postingText: input.postingText, postingUrl: input.postingUrl ?? null }, request.signal);
  return NextResponse.json({ id }, { status: 201 });
});
