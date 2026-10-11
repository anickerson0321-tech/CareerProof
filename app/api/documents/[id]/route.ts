import { NextResponse, type NextRequest } from "next/server";
import { handle, parseJson, requireApiUser } from "@/lib/api/respond";
import { documentOpSchema } from "@/lib/resume/ops";
import { updateResume } from "@/lib/resume/service";
import { letterEditSchema, updateLetter } from "@/lib/letters/service";
import { z } from "zod";

const bodySchema = z.union([letterEditSchema, documentOpSchema]);

// Resume: bullet edits, include toggles, "It's accurate" marks, summary edits,
// page target. Cover letter: the edited text.
export const PATCH = handle(async (request: NextRequest, ctx: RouteContext<"/api/documents/[id]">) => {
  await requireApiUser();
  const { id } = await ctx.params;
  const op = await parseJson(request, bodySchema);
  if (op.op === "letter-edit") return NextResponse.json(await updateLetter(id, op.text));
  return NextResponse.json(await updateResume(id, op));
});
