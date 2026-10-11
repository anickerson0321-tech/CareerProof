import { NextResponse, type NextRequest } from "next/server";
import { handle, requireApiUser } from "@/lib/api/respond";
import { planResumeExport } from "@/lib/resume/export";

export const maxDuration = 60;

// What the download will look like: pages, text size, margins, and (for a
// strict one-page resume that doesn't fit) which lines would need to go.
export const GET = handle(async (_request: NextRequest, ctx: RouteContext<"/api/documents/[id]/fit">) => {
  await requireApiUser();
  const { id } = await ctx.params;
  const plan = await planResumeExport(id);
  return NextResponse.json({
    fits: plan.fit.fits,
    pages: plan.fit.pages,
    label: plan.fit.label,
    note: plan.fit.note,
    cuts: plan.fit.cuts,
    pageTarget: plan.pageTarget,
    heldBack: plan.build.heldBack,
    summaryOmitted: plan.build.summaryOmitted,
    unconfirmedJobs: plan.build.unconfirmedJobs,
  });
});
