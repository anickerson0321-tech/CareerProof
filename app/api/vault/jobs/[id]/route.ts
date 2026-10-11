import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle, notFound, parseJson, requireApiUser } from "@/lib/api/respond";
import { createClient } from "@/lib/supabase/server";
import { isValidResumeDate } from "@/lib/dates/parse";
import { jobIdentity } from "@/lib/vault/normalize";

const dateField = z
  .string()
  .trim()
  .nullable()
  .refine((v) => v === null || v === "" || isValidResumeDate(v), {
    message: "Dates need to look like 2019-06, 2019, or present.",
  })
  .transform((v) => (v ? v.toLowerCase() : null));

const patchSchema = z.union([
  z.object({
    title: z.string().trim().min(1, "Add a job title.").max(200),
    employer: z.string().trim().min(1, "Add the employer.").max(200),
    location: z.string().trim().max(200).nullable(),
    start_date: dateField,
    end_date: dateField,
    dates_uncertain: z.boolean(),
  }),
  z.object({ status: z.literal("confirmed") }),
]);

// Edit job details (which confirms the job) or confirm it as-is.
export const PATCH = handle(async (request: NextRequest, ctx: RouteContext<"/api/vault/jobs/[id]">) => {
  await requireApiUser();
  const { id } = await ctx.params;
  const input = await parseJson(request, patchSchema);
  const supabase = await createClient();

  let previousIdentities: string[] | undefined;
  if (!("status" in input)) {
    // Remember the old name so re-importing the original resume recognizes this job.
    const { data: current } = await supabase.from("jobs").select("employer, title, previous_identities").eq("id", id).maybeSingle();
    if (!current) throw notFound("That job");
    const old = jobIdentity(current.employer, current.title);
    if (old !== jobIdentity(input.employer, input.title) && !current.previous_identities.includes(old)) {
      previousIdentities = [...current.previous_identities, old].slice(-10);
    }
  }

  const update =
    "status" in input
      ? { status: "confirmed" as const }
      : {
          ...input,
          location: input.location || null,
          status: "confirmed" as const,
          ...(previousIdentities ? { previous_identities: previousIdentities } : {}),
        };
  const { data, error } = await supabase.from("jobs").update(update).eq("id", id).select("id").maybeSingle();
  if (error) throw new ApiError(400, "save_failed", "We couldn't save that job. Check the dates and try again.");
  if (!data) throw notFound("That job");
  return NextResponse.json({ ok: true });
});
