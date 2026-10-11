import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handle, parseJson, requireApiUser } from "@/lib/api/respond";
import { answerQuestion } from "@/lib/applications/service";
import { MAX_ANSWER_CHARS } from "@/lib/ai/tasks/answer-to-fact";

export const maxDuration = 60;

const schema = z.object({
  requirementId: z.uuid(),
  answer: z
    .string()
    .trim()
    .min(2, "Type your answer first.")
    .max(MAX_ANSWER_CHARS, "Keep your answer under 2,000 characters."),
});

// Answer → one clean fact saved to the vault (unconfirmed) → requirement re-judged.
export const POST = handle(async (request: NextRequest, ctx: RouteContext<"/api/applications/[id]/answer">) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const { requirementId, answer } = await parseJson(request, schema);
  const outcome = await answerQuestion(user.id, id, requirementId, answer);
  return NextResponse.json(outcome);
});
