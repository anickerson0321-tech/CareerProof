import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handle, parseJson, requireApiUser } from "@/lib/api/respond";
import { generateResume } from "@/lib/resume/service";
import { PAGE_TARGETS } from "@/lib/domain";

export const maxDuration = 120;

const schema = z.object({ pageTarget: z.enum(PAGE_TARGETS) });

// Generate → code guard → AI fact-check → new document version.
export const POST = handle(async (request: NextRequest, ctx: RouteContext<"/api/applications/[id]/resume">) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const { pageTarget } = await parseJson(request, schema);
  const doc = await generateResume(user.id, id, pageTarget, request.signal);
  return NextResponse.json(doc, { status: 201 });
});
