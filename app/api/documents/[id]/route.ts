import { NextResponse, type NextRequest } from "next/server";
import { handle, parseJson, requireApiUser } from "@/lib/api/respond";
import { documentOpSchema } from "@/lib/resume/ops";
import { updateResume } from "@/lib/resume/service";

// Bullet edits, include toggles, "It's accurate" marks, summary edits, page target.
export const PATCH = handle(async (request: NextRequest, ctx: RouteContext<"/api/documents/[id]">) => {
  await requireApiUser();
  const { id } = await ctx.params;
  const op = await parseJson(request, documentOpSchema);
  const doc = await updateResume(id, op);
  return NextResponse.json(doc);
});
