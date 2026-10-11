// One layout spec drives both renderers (PDF and DOCX), so a page in one is a
// page in the other. All sizes are in points (72 pt = 1 inch).

export const PAGE = { width: 612, height: 792 } as const; // US Letter

export interface LayoutStep {
  body: number; // pt
  margin: number; // inches
}

/** Tried in order until the page target fits. Never below 10pt or 0.5". */
export const LAYOUT_STEPS: LayoutStep[] = [
  { body: 10.5, margin: 0.75 },
  { body: 10.5, margin: 0.6 },
  { body: 10, margin: 0.6 },
  { body: 10, margin: 0.5 },
];

/**
 * Extra bottom space in the PDF only. The fit decision is made on the PDF, so
 * the Word file (laid out by Word, not us) gets this much more room and can't
 * spill onto another page because of small differences in line breaking.
 */
export const PDF_SAFETY_BOTTOM = 14;

export const LINE_HEIGHT = 1.2;

export interface Metrics {
  margin: number;
  contentWidth: number;
  body: number;
  name: number;
  contact: number;
  heading: number;
  headingBefore: number;
  headingAfter: number;
  ruleWidth: number;
  jobBefore: number;
  employerAfter: number;
  bulletAfter: number;
  bulletIndent: number;
  bulletHanging: number;
  itemAfter: number;
}

export function metrics(step: LayoutStep): Metrics {
  const margin = step.margin * 72;
  return {
    margin,
    contentWidth: PAGE.width - margin * 2,
    body: step.body,
    name: step.body + 9,
    contact: step.body - 0.5,
    heading: step.body - 0.5,
    headingBefore: round(step.body * 0.9),
    headingAfter: round(step.body * 0.35),
    ruleWidth: 0.75,
    jobBefore: round(step.body * 0.6),
    employerAfter: 2,
    bulletAfter: 1.5,
    bulletIndent: 12,
    bulletHanging: 9,
    itemAfter: 1,
  };
}

export function layoutLabel(step: LayoutStep, pages: number): string {
  return `${pages} ${pages === 1 ? "page" : "pages"} · ${step.body}pt text, ${step.margin}" margins`;
}

function round(n: number) {
  return Math.round(n * 10) / 10;
}

// Cover letters: 1" margins, 11pt (SPEC §9).
export const LETTER = { margin: 72, body: 11, name: 15, contact: 10, paragraphAfter: 9, lineHeight: 1.25 } as const;
