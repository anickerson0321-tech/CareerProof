import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle, notFound, parseJson, requireApiUser } from "@/lib/api/respond";
import { createClient } from "@/lib/supabase/server";
import { normalizeText } from "@/lib/vault/normalize";

const patchSchema = z.union([
  z.object({
    text: z.string().trim().min(3, "Write the fact in a few words.").max(1000, "Keep each fact under 1,000 characters."),
  }),
  z.object({ status: z.literal("confirmed") }),
]);

// Edit (stores a revision and confirms) or confirm one fact.
export const PATCH = handle(async (request: NextRequest, ctx: RouteContext<"/api/vault/facts/[id]">) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const input = await parseJson(request, patchSchema);
  const supabase = await createClient();

  const { data: fact } = await supabase.from("facts").select("id, text, status").eq("id", id).maybeSingle();
  if (!fact || fact.status === "unsupported") throw notFound("That fact");

  if ("text" in input) {
    if (input.text !== fact.text) {
      const { error: revError } = await supabase
        .from("fact_revisions")
        .insert({ user_id: user.id, fact_id: id, previous_text: fact.text, new_text: input.text });
      if (revError) throw new ApiError(500, "save_failed", "We couldn't save your edit. Please try again.");
    }
    const { data, error } = await supabase
      .from("facts")
      .update({ text: input.text, normalized_text: normalizeText(input.text), status: "confirmed" })
      .eq("id", id)
      .select("id, code, text, status")
      .single();
    if (error || !data) throw new ApiError(500, "save_failed", "We couldn't save your edit. Please try again.");
    return NextResponse.json(data);
  }

  const { data, error } = await supabase
    .from("facts")
    .update({ status: "confirmed" })
    .eq("id", id)
    .select("id, code, text, status")
    .single();
  if (error || !data) throw new ApiError(500, "save_failed", "We couldn't confirm that fact. Please try again.");
  return NextResponse.json(data);
});

// Remove: the fact is hidden and can never be cited, but kept as a marker so
// a re-import of the same resume doesn't bring it back.
export const DELETE = handle(async (_request: NextRequest, ctx: RouteContext<"/api/vault/facts/[id]">) => {
  await requireApiUser();
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("facts")
    .update({ status: "unsupported" })
    .eq("id", id)
    .neq("status", "unsupported")
    .select("id")
    .maybeSingle();
  if (error) throw new ApiError(500, "save_failed", "We couldn't remove that fact. Please try again.");
  if (!data) throw notFound("That fact");
  return NextResponse.json({ ok: true });
});
