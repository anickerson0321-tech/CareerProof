// Problems we look for in uploaded resumes, so a bad file never quietly turns
// into a thin vault. Messages are written for the person uploading.

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_RESUME_CHARS = 60_000;
export const MIN_RESUME_CHARS = 200;

export type FileKind = "pdf" | "docx" | "txt" | "doc" | "rtf" | "pages" | "image" | "unknown";

export type WarningCode =
  | "scanned_pdf"
  | "old_doc"
  | "unsupported_type"
  | "garbled"
  | "too_short"
  | "too_long"
  | "empty"
  | "unreadable";

export interface ExtractionWarning {
  code: WarningCode;
  /** True when we can't continue with this text at all. */
  blocking: boolean;
  message: string;
}

/** Identify a file by its first bytes, not its name. */
export function sniffFileKind(bytes: Uint8Array, filename = ""): FileKind {
  const head = (n: number) => Array.from(bytes.slice(0, n));
  const startsWith = (sig: number[]) => sig.every((b, i) => bytes[i] === b);

  if (startsWith([0x25, 0x50, 0x44, 0x46])) return "pdf"; // %PDF
  if (startsWith([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "doc"; // OLE2 (.doc)
  if (startsWith([0x7b, 0x5c, 0x72, 0x74, 0x66])) return "rtf"; // {\rtf
  if (startsWith([0x89, 0x50, 0x4e, 0x47]) || startsWith([0xff, 0xd8, 0xff])) return "image";
  if (startsWith([0x50, 0x4b, 0x03, 0x04])) {
    // A zip. .docx files contain "word/" entries; Pages files are zips too.
    const sample = new TextDecoder("latin1").decode(bytes.slice(0, Math.min(bytes.length, 64 * 1024)));
    if (sample.includes("word/")) return "docx";
    if (/\.pages$/i.test(filename) || sample.includes("Index/Document.iwa")) return "pages";
    return "unknown";
  }
  if (looksLikeText(head(4096))) return "txt";
  return "unknown";
}

function looksLikeText(sample: number[]): boolean {
  if (sample.length === 0) return false;
  let control = 0;
  for (const b of sample) {
    if (b === 0) return false;
    if (b < 9 || (b > 13 && b < 32)) control++;
  }
  return control / sample.length < 0.02;
}

export function fileKindProblem(kind: FileKind): ExtractionWarning | null {
  switch (kind) {
    case "doc":
      return {
        code: "old_doc",
        blocking: true,
        message:
          "This is an older Word file (.doc), which we can't read reliably. In Word, choose File → Save As → Word Document (.docx), then upload that. Or copy your resume and paste it instead.",
      };
    case "rtf":
    case "pages":
    case "image":
    case "unknown":
      return {
        code: "unsupported_type",
        blocking: true,
        message:
          "We can read Word (.docx), PDF, or plain text files. Save your resume in one of those formats, or copy it and paste it instead.",
      };
    default:
      return null;
  }
}

/** Checks on the text we got out, for any source. */
export function checkText(text: string, options: { pages?: number; kind?: FileKind } = {}): ExtractionWarning[] {
  const warnings: ExtractionWarning[] = [];
  const trimmed = text.trim();

  if (trimmed.length > MAX_RESUME_CHARS) {
    warnings.push({
      code: "too_long",
      blocking: true,
      message: `This is longer than we can read at once (${MAX_RESUME_CHARS.toLocaleString("en-US")} characters). Remove anything that isn't part of your resume, such as cover letters or reference letters, and try again.`,
    });
    return warnings;
  }

  const pages = options.pages ?? 1;
  if (options.kind === "pdf" && trimmed.length < 100 * pages) {
    warnings.push({
      code: "scanned_pdf",
      blocking: true,
      message:
        "This PDF looks like a scan or a picture of your resume, so there's almost no text we can read. If you have the original Word or Google Docs file, upload that. Otherwise, copy the text and paste it instead.",
    });
    return warnings;
  }

  if (trimmed.length === 0) {
    warnings.push({ code: "empty", blocking: true, message: "We couldn't find any text. Check the file, or paste your resume instead." });
    return warnings;
  }

  if (trimmed.length < MIN_RESUME_CHARS) {
    warnings.push({
      code: "too_short",
      blocking: false,
      message:
        "This is very short for a resume, so your vault may come out thin. If something's missing, paste the full text instead.",
    });
  }

  const garbled = garbleScore(trimmed);
  if (garbled > 0.08) {
    warnings.push({
      code: "garbled",
      blocking: garbled > 0.25,
      message:
        garbled > 0.25
          ? "Most of this text came out scrambled, which usually happens with scanned or unusual PDFs. Upload a Word file or paste the text instead."
          : "Parts of this text look scrambled. Check the preview below. If words are broken or full of odd symbols, paste the text instead.",
    });
  }

  return warnings;
}

/**
 * Share of "words" that look broken: replacement characters, (cid:N) codes
 * from bad PDF fonts, long runs of symbols, or no vowels at all.
 */
export function garbleScore(text: string): number {
  const tokens = text.split(/\s+/).filter((t) => t.length >= 3);
  if (tokens.length === 0) return 0;
  let bad = 0;
  for (const token of tokens) {
    const letters = token.replace(/[^A-Za-zÀ-ÿ]/g, "");
    if (token.includes("�") || /\(cid:\d+\)/.test(token)) bad++;
    else if (letters.length / token.length < 0.5 && !/^[\d$%.,()+\-–/:#@&]+$/.test(token) && !/@|\.(com|org|net)/i.test(token)) bad++;
    else if (letters.length >= 4 && !/[aeiouyAEIOUY]/.test(letters)) bad++;
  }
  return bad / tokens.length;
}

/** Normalize line endings and whitespace without changing the words. */
export function cleanText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
