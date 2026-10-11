import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle, notFound, parseJson, requireApiUser } from "@/lib/api/respond";
import { createClient } from "@/lib/supabase/server";
import { APP_STATUSES } from "@/lib/domain";

const schema = z.object({ status: z.enum(APP_STATUSES) });

export const PATCH = handle(async (request: NextRequest, ctx: RouteContext<"/api/applications/[id]">) => {
  await requireApiUser();
  const { id } = await ctx.params;
  const { status } = await parseJson(request, schema);
  const supabase = await createClient();
  const { data, error } = await supabase.from("applications").update({ status }).eq("id", id).select("id, status").maybeSingle();
  if (error) throw new ApiError(500, "save_failed", "We couldn't update the status. Please try again.");
  if (!data) throw notFound("That application");
  return NextResponse.json(data);
});
