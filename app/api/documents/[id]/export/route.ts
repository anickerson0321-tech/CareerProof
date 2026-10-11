import { NextResponse, type NextRequest } from "next/server";
import { fail, handle, requireApiUser } from "@/lib/api/respond";
import { DoesNotFitError, exportDocument } from "@/lib/resume/export";

export const maxDuration = 60;

// Download. The server re-runs Truth Guard and page fitting every time and
// leaves out any line that can't be exported, whatever the browser sent.
export const GET = handle(async (request: NextRequest, ctx: RouteContext<"/api/documents/[id]/export">) => {
  await requireApiUser();
  const { id } = await ctx.params;
  const format = request.nextUrl.searchParams.get("format");
  if (format !== "docx" && format !== "pdf") {
    return fail(400, "bad_format", "Choose Word (.docx) or PDF.");
  }
  try {
    const file = await exportDocument(id, format);
    return new NextResponse(Buffer.from(file.body), {
      headers: {
        "content-type": file.contentType,
        "content-disposition": `attachment; filename="${file.filename.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        "cache-control": "private, no-store",
        ...(file.pages !== null ? { "x-page-count": String(file.pages) } : {}),
      },
    });
  } catch (error) {
    if (error instanceof DoesNotFitError) {
      return NextResponse.json(
        { error: { code: "does_not_fit", message: error.message }, cuts: error.cuts },
        { status: 422 },
      );
    }
    throw error;
  }
});
