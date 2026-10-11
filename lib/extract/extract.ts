import "server-only";
import mammoth from "mammoth";
import { extractText as extractPdfText, getDocumentProxy } from "unpdf";
import { checkText, cleanText, fileKindProblem, sniffFileKind, type ExtractionWarning, type FileKind } from "./detect";

export interface ExtractionResult {
  kind: FileKind;
  text: string;
  pages: number | null;
  warnings: ExtractionWarning[];
  blocking: boolean;
}

export async function extractFromFile(bytes: Uint8Array, filename: string): Promise<ExtractionResult> {
  const kind = sniffFileKind(bytes, filename);
  const kindProblem = fileKindProblem(kind);
  if (kindProblem) return { kind, text: "", pages: null, warnings: [kindProblem], blocking: true };

  let raw = "";
  let pages: number | null = null;
  try {
    if (kind === "pdf") {
      const pdf = await getDocumentProxy(bytes);
      const result = await extractPdfText(pdf, { mergePages: true });
      raw = result.text;
      pages = result.totalPages;
    } else if (kind === "docx") {
      const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      raw = result.value;
    } else {
      raw = new TextDecoder("utf-8").decode(bytes);
    }
  } catch {
    const warning: ExtractionWarning = {
      code: "unreadable",
      blocking: true,
      message:
        "We couldn't open this file. It may be damaged or password-protected. Try saving it again, or paste your resume instead.",
    };
    return { kind, text: "", pages, warnings: [warning], blocking: true };
  }

  return fromText(raw, { kind, pages });
}

export function fromText(raw: string, options: { kind?: FileKind; pages?: number | null } = {}): ExtractionResult {
  const text = cleanText(raw);
  const warnings = checkText(text, { kind: options.kind, pages: options.pages ?? undefined });
  return {
    kind: options.kind ?? "txt",
    text,
    pages: options.pages ?? null,
    warnings,
    blocking: warnings.some((w) => w.blocking),
  };
}
