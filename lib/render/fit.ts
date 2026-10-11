import "server-only";
import type { PageTarget } from "@/lib/domain";
import { cutCandidates, withoutBullets, type ExportBullet, type ExportResume } from "./export-model";
import { LAYOUT_STEPS, layoutLabel, type LayoutStep } from "./layout";
import { countPdfPages, renderResumePdf } from "./pdf";

// Page fitting (SPEC §9): try each layout step until the page target fits,
// measuring the page count of the actual generated PDF every time.

export interface FitResult {
  fits: boolean;
  pages: number;
  step: LayoutStep;
  label: string;
  /** Plain-language note about the result, if any. */
  note: string | null;
  /** Strict one page only: lines that would need to go, in order. Nothing is removed for you. */
  cuts: Pick<ExportBullet, "id" | "text">[];
  pdf: Uint8Array;
}


export async function fitResume(model: ExportResume, target: PageTarget): Promise<FitResult> {
  const targetPages = target === "up_to_two" ? 2 : 1;
  const attempts: { step: LayoutStep; pdf: Uint8Array; pages: number }[] = [];

  for (const step of LAYOUT_STEPS) {
    const pdf = await renderResumePdf(model, step);
    const pages = await countPdfPages(pdf);
    attempts.push({ step, pdf, pages });
    if (pages <= targetPages) {
      return { fits: true, pages, step, label: layoutLabel(step, pages), note: null, cuts: [], pdf };
    }
  }

  const smallest = attempts[attempts.length - 1]!;

  if (target === "strict_one") {
    const cuts = await suggestCuts(model, smallest.step);
    return {
      fits: false,
      pages: smallest.pages,
      step: smallest.step,
      label: layoutLabel(smallest.step, smallest.pages),
      note:
        cuts.length > 0
          ? `This doesn't fit on one page, even at the smallest text size. Removing ${cuts.length} ${cuts.length === 1 ? "line" : "lines"} would make it fit.`
          : "This doesn't fit on one page, even at the smallest text size. Choose \"One page if possible\" or \"Up to two pages\".",
      cuts,
      pdf: smallest.pdf,
    };
  }

  if (target === "one_if_possible") {
    // Use the largest text that fits on two pages.
    const two = attempts.find((a) => a.pages <= 2) ?? smallest;
    return {
      fits: two.pages <= 2,
      pages: two.pages,
      step: two.step,
      label: layoutLabel(two.step, two.pages),
      note: "It didn't fit on one page, so your resume is two pages. To get one page, uncheck some lines.",
      cuts: [],
      pdf: two.pdf,
    };
  }

  return {
    fits: false,
    pages: smallest.pages,
    step: smallest.step,
    label: layoutLabel(smallest.step, smallest.pages),
    note: `This runs to ${smallest.pages} pages at the smallest text size. Uncheck some lines to bring it to two.`,
    cuts: [],
    pdf: smallest.pdf,
  };
}

/**
 * The fewest of the least important lines to remove so it fits on one page.
 * Removing more never adds pages, so a binary search finds the smallest set.
 */
async function suggestCuts(model: ExportResume, step: LayoutStep): Promise<Pick<ExportBullet, "id" | "text">[]> {
  const order = cutCandidates(model);
  const fitsWithout = async (k: number) =>
    (await countPdfPages(await renderResumePdf(withoutBullets(model, new Set(order.slice(0, k).map((b) => b.id))), step))) <= 1;
  if (order.length === 0 || !(await fitsWithout(order.length))) return [];
  let low = 1;
  let high = order.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (await fitsWithout(mid)) high = mid;
    else low = mid + 1;
  }
  return order.slice(0, low).map((b) => ({ id: b.id, text: b.text }));
}
