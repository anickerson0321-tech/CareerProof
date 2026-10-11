import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handle, parseJson, requireApiUser } from "@/lib/api/respond";
import { setGap } from "@/lib/applications/service";

const schema = z.object({ requirementId: z.uuid(), gap: z.boolean() });

// "I don't have this" (gap: true) and Undo (gap: false). Only the person can
// declare a gap.
export const POST = handle(async (request: NextRequest, ctx: RouteContext<"/api/applications/[id]/gap">) => {
  await requireApiUser();
  const { id } = await ctx.params;
  const { requirementId, gap } = await parseJson(request, schema);
  await setGap(id, requirementId, gap);
  return NextResponse.json({ ok: true });
});
