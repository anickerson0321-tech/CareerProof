import { NextResponse } from "next/server";
import { ApiError, handle, requireApiUser } from "@/lib/api/respond";
import { createClient } from "@/lib/supabase/server";

// "Confirm all": every pending fact and job in the vault becomes confirmed.
export const POST = handle(async () => {
  await requireApiUser();
  const supabase = await createClient();
  const [facts, jobs] = await Promise.all([
    supabase.from("facts").update({ status: "confirmed" }).eq("status", "pending").select("id"),
    supabase.from("jobs").update({ status: "confirmed" }).eq("status", "pending").select("id"),
  ]);
  if (facts.error || jobs.error) throw new ApiError(500, "save_failed", "We couldn't confirm everything. Please try again.");
  return NextResponse.json({ facts: facts.data?.length ?? 0, jobs: jobs.data?.length ?? 0 });
});
