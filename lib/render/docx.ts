import "server-only";
import {
  AlignmentType,
  BorderStyle,
  Document,
  LevelFormat,
  LineRuleType,
  Packer,
  Paragraph,
  Tab,
  TabStopType,
  TextRun,
} from "docx";
import type { ExportResume } from "./export-model";
import { LETTER, LINE_HEIGHT, metrics, PAGE, type LayoutStep } from "./layout";
import type { LetterModel } from "./pdf";

// Word renderer, built from the same layout numbers as the PDF. Word lays the
// text out itself, so the PDF (which we can measure) gets extra bottom space
// (PDF_SAFETY_BOTTOM) and this file gets the normal margin.

const twips = (pt: number) => Math.round(pt * 20);
const halfPoints = (pt: number) => Math.round(pt * 2);
const FONT = "Arial";

function exactLine(size: number, multiplier = LINE_HEIGHT) {
  return { line: twips(size * multiplier), lineRule: LineRuleType.EXACT };
}

export async function renderResumeDocx(model: ExportResume, step: LayoutStep): Promise<Buffer> {
  const m = metrics(step);
  const contentWidth = twips(m.contentWidth);

  const text = (value: string, opts: { bold?: boolean; italics?: boolean; size?: number } = {}) =>
    new TextRun({ text: value, font: FONT, size: halfPoints(opts.size ?? m.body), bold: opts.bold, italics: opts.italics });

  const heading = (label: string) =>
    new Paragraph({
      spacing: { before: twips(m.headingBefore), after: twips(m.headingAfter), ...exactLine(m.heading) },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, space: 1, color: "111111" } },
      keepNext: true,
      children: [
        new TextRun({ text: label.toUpperCase(), font: FONT, size: halfPoints(m.heading), bold: true, characterSpacing: twips(0.6) }),
      ],
    });

  const body = (value: string, after = 0) =>
    new Paragraph({ spacing: { before: 0, after: twips(after), ...exactLine(m.body) }, children: [text(value)] });

  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 0, ...exactLine(m.name) },
      children: [text(model.name, { bold: true, size: m.name })],
    }),
  ];
  if (model.contactLine) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: twips(2), after: 0, ...exactLine(m.contact) },
        children: [text(model.contactLine, { size: m.contact })],
      }),
    );
  }

  if (model.summary) {
    children.push(heading("Summary"), body(model.summary));
  }

  if (model.jobs.length > 0) children.push(heading("Experience"));
  model.jobs.forEach((job, i) => {
    children.push(
      new Paragraph({
        spacing: { before: twips(i === 0 ? 0 : m.jobBefore), after: 0, ...exactLine(m.body) },
        tabStops: [{ type: TabStopType.RIGHT, position: contentWidth }],
        keepNext: true,
        children: [text(job.title, { bold: true }), new TextRun({ children: [new Tab(), job.dates], font: FONT, size: halfPoints(m.body) })],
      }),
      new Paragraph({
        spacing: { before: 0, after: twips(m.employerAfter), ...exactLine(m.body) },
        keepNext: job.bullets.length > 0,
        children: [text(`${job.employer}${job.location ? `, ${job.location}` : ""}`, { italics: true })],
      }),
    );
    for (const b of job.bullets) {
      children.push(
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          spacing: { before: 0, after: twips(m.bulletAfter), ...exactLine(m.body) },
          keepLines: true,
          children: [text(b.text)],
        }),
      );
    }
  });

  if (model.skills.length > 0) children.push(heading("Skills"), body(model.skills.join(" • ")));
  if (model.education.length > 0) {
    children.push(heading("Education"), ...model.education.map((e) => body(e, m.itemAfter)));
  }
  if (model.certifications.length > 0) {
    children.push(heading("Certifications"), ...model.certifications.map((c) => body(c, m.itemAfter)));
  }

  const doc = new Document({
    creator: "CareerProof",
    title: `${model.name} resume`,
    styles: { default: { document: { run: { font: FONT, size: halfPoints(m.body) } } } },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: twips(m.bulletIndent), hanging: twips(m.bulletHanging) } },
                run: { font: FONT },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: twips(PAGE.width), height: twips(PAGE.height) },
            margin: { top: twips(m.margin), bottom: twips(m.margin), left: twips(m.margin), right: twips(m.margin), header: 0, footer: 0 },
          },
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}

export async function renderLetterDocx(model: LetterModel, paragraphs: string[]): Promise<Buffer> {
  const run = (value: string, opts: { bold?: boolean; size?: number } = {}) =>
    new TextRun({ text: value, font: FONT, size: halfPoints(opts.size ?? LETTER.body), bold: opts.bold });
  const lines = (value: string) =>
    value.split("\n").map((line, i) => new TextRun({ text: line, font: FONT, size: halfPoints(LETTER.body), break: i === 0 ? 0 : 1 }));

  const children = [
    new Paragraph({ spacing: { after: 0, ...exactLine(LETTER.name) }, children: [run(model.name, { bold: true, size: LETTER.name })] }),
    ...(model.contactLine
      ? [new Paragraph({ spacing: { before: twips(2), after: 0, ...exactLine(LETTER.contact) }, children: [run(model.contactLine, { size: LETTER.contact })] })]
      : []),
    new Paragraph({ spacing: { before: twips(18), after: twips(18), ...exactLine(LETTER.body, LETTER.lineHeight) }, children: [run(model.date)] }),
    ...paragraphs.map(
      (p) =>
        new Paragraph({
          spacing: { after: twips(LETTER.paragraphAfter), line: twips(LETTER.body * LETTER.lineHeight), lineRule: LineRuleType.EXACT },
          children: lines(p),
        }),
    ),
  ];

  const doc = new Document({
    creator: "CareerProof",
    title: `${model.name} cover letter`,
    styles: { default: { document: { run: { font: FONT, size: halfPoints(LETTER.body) } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: twips(PAGE.width), height: twips(PAGE.height) },
            margin: { top: twips(LETTER.margin), bottom: twips(LETTER.margin), left: twips(LETTER.margin), right: twips(LETTER.margin) },
          },
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}
