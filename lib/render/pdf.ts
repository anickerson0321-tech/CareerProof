import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { ExportResume } from "./export-model";
import { LETTER, LINE_HEIGHT, metrics, PAGE, PDF_SAFETY_BOTTOM, type LayoutStep } from "./layout";

// PDF renderer on pdf-lib. Lines are broken the way Word breaks them (greedy,
// real glyph widths, spaces never squeezed) with the same exact line heights
// and spacing as the .docx, so both formats paginate alike. Liberation Sans
// has the same metrics as Arial, which the Word file uses.

const FONT_DIR = join(process.cwd(), "lib", "render", "fonts");
let fontBytes: Record<FontStyle, Uint8Array> | null = null;

type FontStyle = "regular" | "bold" | "italic" | "boldItalic";

function loadFontBytes() {
  fontBytes ??= {
    regular: readFileSync(join(FONT_DIR, "LiberationSans-Regular.ttf")),
    bold: readFileSync(join(FONT_DIR, "LiberationSans-Bold.ttf")),
    italic: readFileSync(join(FONT_DIR, "LiberationSans-Italic.ttf")),
    boldItalic: readFileSync(join(FONT_DIR, "LiberationSans-BoldItalic.ttf")),
  };
  return fontBytes;
}

const INK = rgb(0.067, 0.067, 0.067);

interface Box {
  left: number;
  right: number;
  top: number;
  /** Lowest y (from the top) that text may reach. */
  bottom: number;
}

class Writer {
  private page!: PDFPage;
  /** Distance from the top of the page to the next line's top. */
  y = 0;
  pages = 0;

  constructor(
    private doc: PDFDocument,
    readonly fonts: Record<FontStyle, PDFFont>,
    readonly box: Box,
  ) {
    this.newPage();
  }

  static async create(box: Box, title: string, author: string) {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const bytes = loadFontBytes();
    const fonts = {
      regular: await doc.embedFont(bytes.regular, { subset: true }),
      bold: await doc.embedFont(bytes.bold, { subset: true }),
      italic: await doc.embedFont(bytes.italic, { subset: true }),
      boldItalic: await doc.embedFont(bytes.boldItalic, { subset: true }),
    };
    doc.setTitle(title);
    doc.setAuthor(author);
    doc.setCreator("CareerProof");
    doc.setProducer("CareerProof");
    return { doc, writer: new Writer(doc, fonts, box) };
  }

  newPage() {
    this.page = this.doc.addPage([PAGE.width, PAGE.height]);
    this.y = this.box.top;
    this.pages++;
  }

  get width() {
    return this.box.right - this.box.left;
  }

  /** Space left on this page. */
  remaining() {
    return this.box.bottom - this.y;
  }

  ensure(height: number) {
    if (height > this.remaining() && this.y > this.box.top) this.newPage();
  }

  measure(text: string, style: FontStyle, size: number, letterSpacing = 0) {
    return this.fonts[style].widthOfTextAtSize(text, size) + letterSpacing * Math.max(0, text.length - 1);
  }

  /** Greedy word wrap, like Word: a word that doesn't fit moves to the next line. */
  wrap(text: string, style: FontStyle, size: number, width: number): string[] {
    const lines: string[] = [];
    for (const hardLine of text.split("\n")) {
      const words = hardLine.split(/ +/).filter((w) => w.length > 0);
      let line = "";
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (this.measure(candidate, style, size) <= width) {
          line = candidate;
          continue;
        }
        if (line) lines.push(line);
        // A single word wider than the line is broken by characters.
        let rest = word;
        while (this.measure(rest, style, size) > width) {
          let cut = rest.length - 1;
          while (cut > 1 && this.measure(rest.slice(0, cut), style, size) > width) cut--;
          lines.push(rest.slice(0, cut));
          rest = rest.slice(cut);
        }
        line = rest;
      }
      lines.push(line);
    }
    return lines;
  }

  /** Draw one line whose box starts at the current y and is `lineHeight` tall. */
  drawLine(text: string, x: number, style: FontStyle, size: number, lineHeight: number, letterSpacing = 0) {
    // Same placement as an exact-height line in Word: text centred in the line box.
    const baseline = this.y + (lineHeight - size) / 2 + size * 0.8;
    const pdfY = PAGE.height - baseline;
    if (letterSpacing === 0) {
      this.page.drawText(text, { x, y: pdfY, size, font: this.fonts[style], color: INK });
      return;
    }
    let cursor = x;
    for (const ch of text) {
      this.page.drawText(ch, { x: cursor, y: pdfY, size, font: this.fonts[style], color: INK });
      cursor += this.fonts[style].widthOfTextAtSize(ch, size) + letterSpacing;
    }
  }

  rule(y: number, thickness: number) {
    this.page.drawLine({
      start: { x: this.box.left, y: PAGE.height - y },
      end: { x: this.box.right, y: PAGE.height - y },
      thickness,
      color: INK,
    });
  }

  /**
   * A paragraph with Word-like spacing. keepLines keeps it on one page;
   * keepWithNext reserves room for the first line of what follows.
   */
  paragraph(
    text: string,
    opts: {
      style?: FontStyle;
      size: number;
      lineHeight?: number;
      before?: number;
      after?: number;
      indent?: number;
      align?: "left" | "center";
      keepLines?: boolean;
      keepWithNext?: number;
      marker?: { text: string; x: number };
    },
  ) {
    const style = opts.style ?? "regular";
    const lh = opts.lineHeight ?? opts.size * LINE_HEIGHT;
    const indent = opts.indent ?? 0;
    const width = this.width - indent;
    const lines = this.wrap(text, style, opts.size, width);
    const before = this.y === this.box.top ? 0 : (opts.before ?? 0);

    const needed = before + (opts.keepLines ? lines.length * lh : lh) + (opts.keepWithNext ?? 0);
    this.ensure(needed);
    this.y += this.y === this.box.top ? 0 : before;

    lines.forEach((line, i) => {
      if (i > 0) this.ensure(lh);
      const lineWidth = this.measure(line, style, opts.size);
      const x = opts.align === "center" ? this.box.left + (this.width - lineWidth) / 2 : this.box.left + indent;
      if (i === 0 && opts.marker) this.drawLine(opts.marker.text, this.box.left + opts.marker.x, style, opts.size, lh);
      this.drawLine(line, x, style, opts.size, lh);
      this.y += lh;
    });
    this.y += opts.after ?? 0;
  }
}

function contentBox(margin: number, safetyBottom: number): Box {
  return { left: margin, right: PAGE.width - margin, top: margin, bottom: PAGE.height - margin - safetyBottom };
}

export async function renderResumePdf(model: ExportResume, step: LayoutStep): Promise<Uint8Array> {
  const m = metrics(step);
  const { doc, writer: w } = await Writer.create(contentBox(m.margin, PDF_SAFETY_BOTTOM), `${model.name} resume`, model.name);
  const bodyLine = m.body * LINE_HEIGHT;

  const heading = (label: string) => {
    const lh = m.heading * LINE_HEIGHT;
    const borderSpace = 1 + m.ruleWidth; // Word adds the border's space and width to the paragraph
    const before = w.y === w.box.top ? 0 : m.headingBefore;
    w.ensure(before + lh + borderSpace + m.headingAfter + bodyLine);
    w.y += before;
    w.drawLine(label.toUpperCase(), w.box.left, "bold", m.heading, lh, 0.6);
    w.y += lh;
    w.rule(w.y + 1 + m.ruleWidth / 2, m.ruleWidth);
    w.y += borderSpace + m.headingAfter;
  };

  w.paragraph(model.name, { style: "bold", size: m.name, align: "center" });
  if (model.contactLine) w.paragraph(model.contactLine, { size: m.contact, align: "center", before: 2 });

  if (model.summary) {
    heading("Summary");
    w.paragraph(model.summary, { size: m.body });
  }

  if (model.jobs.length > 0) heading("Experience");
  model.jobs.forEach((job, i) => {
    const before = i === 0 ? 0 : m.jobBefore;
    // Title + employer stay with the first bullet (keepNext in the .docx).
    w.ensure(before + bodyLine * 2 + m.employerAfter + (job.bullets.length > 0 ? bodyLine : 0));
    w.y += w.y === w.box.top ? 0 : before;
    w.drawLine(job.title, w.box.left, "bold", m.body, bodyLine);
    const datesWidth = w.measure(job.dates, "regular", m.body);
    w.drawLine(job.dates, w.box.right - datesWidth, "regular", m.body, bodyLine);
    w.y += bodyLine;
    w.paragraph(`${job.employer}${job.location ? `, ${job.location}` : ""}`, { style: "italic", size: m.body, after: m.employerAfter });
    for (const b of job.bullets) {
      w.paragraph(b.text, {
        size: m.body,
        indent: m.bulletIndent,
        after: m.bulletAfter,
        keepLines: true,
        marker: { text: "•", x: m.bulletIndent - m.bulletHanging },
      });
    }
  });

  if (model.skills.length > 0) {
    heading("Skills");
    w.paragraph(model.skills.join(" • "), { size: m.body });
  }
  if (model.education.length > 0) {
    heading("Education");
    for (const e of model.education) w.paragraph(e, { size: m.body, after: m.itemAfter });
  }
  if (model.certifications.length > 0) {
    heading("Certifications");
    for (const c of model.certifications) w.paragraph(c, { size: m.body, after: m.itemAfter });
  }

  return doc.save();
}

/** Counts pages in the actual generated file. */
export async function countPdfPages(pdf: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  return doc.getPageCount();
}

export interface LetterModel {
  name: string;
  contactLine: string;
  date: string;
  text: string;
}

export async function renderLetterPdf(model: LetterModel): Promise<Uint8Array> {
  const { doc, writer: w } = await Writer.create(contentBox(LETTER.margin, 0), `${model.name} cover letter`, model.name);
  const lh = LETTER.body * LETTER.lineHeight;
  w.paragraph(model.name, { style: "bold", size: LETTER.name });
  if (model.contactLine) w.paragraph(model.contactLine, { size: LETTER.contact, before: 2 });
  w.paragraph(model.date, { size: LETTER.body, lineHeight: lh, before: 18, after: 18 });
  for (const p of letterParagraphs(model.text)) {
    w.paragraph(p, { size: LETTER.body, lineHeight: lh, after: LETTER.paragraphAfter });
  }
  return doc.save();
}

/** Paragraphs split on blank lines; single line breaks are kept inside a paragraph. */
export function letterParagraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
