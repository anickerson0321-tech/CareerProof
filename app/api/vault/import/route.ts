import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handle, parseJson, requireApiUser } from "@/lib/api/respond";
import { importResume } from "@/lib/vault/import";

export const maxDuration = 120;

const schema = z.object({ sourceDocumentId: z.uuid() });

// Resume text → AI extraction → merged into the vault as items to confirm.
// If the person cancels, the request is aborted and nothing is saved.
export const POST = handle(async (request: NextRequest) => {
  const user = await requireApiUser();
  const { sourceDocumentId } = await parseJson(request, schema);
  const summary = await importResume(user.id, sourceDocumentId, request.signal);
  return NextResponse.json(summary);
});
