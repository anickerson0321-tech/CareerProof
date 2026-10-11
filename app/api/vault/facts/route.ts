import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle, parseJson, requireApiUser } from "@/lib/api/respond";
import { createClient } from "@/lib/supabase/server";
import { normalizeText } from "@/lib/vault/normalize";
import { MANUAL_FACT_TYPES } from "@/lib/vault/fact-types";

const schema = z.object({
  type: z.enum(MANUAL_FACT_TYPES),
  jobId: z.uuid().nullable(),
  text: z.string().trim().min(3, "Write the fact in a few words.").max(1000, "Keep each fact under 1,000 characters."),
});

// "+ Add a fact yourself": saved as confirmed, origin "manual".
export const POST = handle(async (request: NextRequest) => {
  const user = await requireApiUser();
  const input = await parseJson(request, schema);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("facts")
    .insert({
      user_id: user.id,
      type: input.type,
      job_id: input.jobId,
      text: input.text,
      normalized_text: normalizeText(input.text),
      origin: "manual",
      status: "confirmed",
    })
    .select("id, code")
    .single();
  if (error || !data) {
    throw new ApiError(400, "save_failed", "We couldn't add that fact. If you picked a job, check it still exists, then try again.");
  }
  return NextResponse.json(data, { status: 201 });
});
