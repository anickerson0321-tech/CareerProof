import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractFromFile, fromText } from "@/lib/extract/extract";
import { garbleScore, sniffFileKind, MAX_RESUME_CHARS } from "@/lib/extract/detect";

const files = join(__dirname, "..", "fixtures", "files");
const resumes = join(__dirname, "..", "fixtures", "resumes");
const bytes = (name: string) => new Uint8Array(readFileSync(join(files, name)));

describe("file type detection", () => {
  it("identifies files by content, not name", () => {
    expect(sniffFileKind(bytes("custodial-lead.pdf"), "resume.docx")).toBe("pdf");
    expect(sniffFileKind(bytes("custodial-lead.docx"), "resume.pdf")).toBe("docx");
    expect(sniffFileKind(bytes("old.doc"), "resume.doc")).toBe("doc");
    expect(sniffFileKind(new TextEncoder().encode("Plain resume text\nLine two"))).toBe("txt");
    expect(sniffFileKind(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0]))).toBe("image");
  });
});

describe("extractFromFile", () => {
  it("reads a Word file", async () => {
    const result = await extractFromFile(bytes("custodial-lead.docx"), "custodial-lead.docx");
    expect(result.kind).toBe("docx");
    expect(result.blocking).toBe(false);
    expect(result.text).toContain("Kettering Valley Hospital");
    expect(result.text).toContain("Cut cleaning supply spending by 15%");
  });

  it("reads a text PDF", async () => {
    const result = await extractFromFile(bytes("custodial-lead.pdf"), "custodial-lead.pdf");
    expect(result.kind).toBe("pdf");
    expect(result.pages).toBeGreaterThanOrEqual(1);
    expect(result.blocking).toBe(false);
    expect(result.text).toContain("Lead Custodian");
  });

  it("stops on a scanned PDF and says what to do", async () => {
    const result = await extractFromFile(bytes("scanned.pdf"), "scan.pdf");
    expect(result.blocking).toBe(true);
    expect(result.warnings[0]?.code).toBe("scanned_pdf");
    expect(result.warnings[0]?.message).toMatch(/scan/);
    expect(result.warnings[0]?.message).toMatch(/paste/);
  });

  it("stops on an old .doc file with save-as instructions", async () => {
    const result = await extractFromFile(bytes("old.doc"), "resume.doc");
    expect(result.blocking).toBe(true);
    expect(result.warnings[0]?.code).toBe("old_doc");
    expect(result.warnings[0]?.message).toContain(".docx");
  });

  it("stops on unsupported files", async () => {
    const result = await extractFromFile(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]), "photo.png");
    expect(result.warnings[0]?.code).toBe("unsupported_type");
  });
});

describe("text checks", () => {
  it("flags OCR text from a scanned resume as scrambled", () => {
    const result = fromText(readFileSync(join(resumes, "scanned-ocr.txt"), "utf8"));
    expect(result.warnings.map((w) => w.code)).toContain("garbled");
    expect(result.blocking).toBe(false);
  });

  it("blocks text that is mostly scrambled", () => {
    const junk = Array.from({ length: 80 }, (_, i) => (i % 2 ? "qzxwv" : "(cid:12)")).join(" ");
    expect(fromText(junk).blocking).toBe(true);
  });

  it("doesn't flag clean resumes", () => {
    for (const name of ["custodial-lead.txt", "career-changer.txt", "new-grad.txt", "skills-table.txt"]) {
      expect(fromText(readFileSync(join(resumes, name), "utf8")).warnings, name).toEqual([]);
    }
  });

  it("warns on very short text and blocks empty or huge text", () => {
    expect(fromText("Jane Doe. Cashier at Shop 2020-2022.").warnings[0]?.code).toBe("too_short");
    expect(fromText("   \n ").warnings[0]?.code).toBe("empty");
    expect(fromText("a ".repeat(MAX_RESUME_CHARS)).warnings[0]?.code).toBe("too_long");
  });

  it("doesn't treat emails, numbers and dates as scrambled", () => {
    expect(garbleScore("jane@example.com (555) 201-7744 2019-2024 $52,000 15% 4.0")).toBe(0);
  });

  it("cleans line endings and spacing without changing words", () => {
    expect(fromText("Line one  \r\n\r\n\r\n\r\nLine two").text).toBe("Line one\n\nLine two");
  });
});
