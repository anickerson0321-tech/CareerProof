import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, handle, notFound, requireApiUser } from "@/lib/api/respond";
import { loadApplication } from "@/lib/applications/service";
import { assertCanWriteCoverLetter } from "@/lib/billing/limits";
import { buildRequirementViews } from "@/lib/matching/view";
import { currentYearMonth } from "@/lib/dates/parse";
import { letterRequest } from "@/lib/ai/tasks/cover-letter";
import { STREAM_ERROR_MARK } from "@/lib/letters/text";
import { startTextStream } from "@/lib/ai/run";
import { createClient } from "@/lib/supabase/server";
import { loadLatestLetter } from "@/lib/letters/service";

export const maxDuration = 90;

// The latest saved letter (the browser asks for it after a stream finishes).
export const GET = handle(async (_request: NextRequest, ctx: RouteContext<"/api/applications/[id]/cover-letter">) => {
  await requireApiUser();
  const { id } = await ctx.params;
  const letter = await loadLatestLetter(id);
  if (!letter) throw notFound("That cover letter");
  return NextResponse.json(letter);
});

// Streams the letter as plain text, then saves it as a new cover-letter version.
export const POST = handle(async (request: NextRequest, ctx: RouteContext<"/api/applications/[id]/cover-letter">) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("plan, full_name").eq("user_id", user.id).single();
  assertCanWriteCoverLetter(profile?.plan ?? "free");

  const data = await loadApplication(id);
  if (!data) throw notFound("That application");
  const views = buildRequirementViews(data.requirements, data.facts, data.jobs, currentYearMonth());

  let stream: Awaited<ReturnType<typeof startTextStream>>;
  try {
    stream = await startTextStream(
      user.id,
      letterRequest(
        { name: profile?.full_name?.trim() || "", title: data.application.title, employer: data.application.employer, views },
        request.signal,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let text = "";
      try {
        for await (const chunk of stream.chunks) {
          text += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
        await stream.done;
        const { data: latest } = await supabase
          .from("documents")
          .select("version")
          .eq("application_id", id)
          .eq("kind", "cover_letter")
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle();
        await supabase.from("documents").insert({
          user_id: user.id,
          application_id: id,
          kind: "cover_letter",
          version: (latest?.version ?? 0) + 1,
          content: { text: text.trim() },
        });
      } catch {
        if (!request.signal.aborted) {
          controller.enqueue(encoder.encode(`${STREAM_ERROR_MARK}The letter stopped partway. Please try again.`));
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
});
