import { readFile } from "node:fs/promises";
import { expect, test, type Download, type Page } from "@playwright/test";
import mammoth from "mammoth";
import { PDFDocument } from "pdf-lib";
import { extractText, getDocumentProxy } from "unpdf";
import { adminRest, setPlan } from "./helpers/auth";
import { deniseReadyToWrite, line, writeResume } from "./helpers/flows";

// M5: Export + cover letter.

async function saved(download: Download) {
  const path = await download.path();
  return readFile(path);
}

async function pdfInfo(bytes: Buffer) {
  const pages = (await PDFDocument.load(bytes)).getPageCount();
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(bytes)), { mergePages: true });
  return { pages, text: text.replace(/\s+/g, " ") };
}

async function docxText(bytes: Buffer) {
  return (await mammoth.extractRawText({ buffer: bytes })).value.replace(/\s+/g, " ");
}

async function downloadVia(page: Page, name: string) {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name }).click()]);
  return download;
}

function applicationId(page: Page) {
  return /\/applications\/([0-9a-f-]{36})/.exec(page.url())![1]!;
}

type Bullet = { id: string; text: string; fact_ids: string[]; relevance: number; included: boolean; reviewed: boolean; ai_check: unknown };
type Content = { jobs: { job_id: string; bullets: Bullet[] }[] };

async function latestResume(appId: string): Promise<{ id: string; content: Content }> {
  const rows = (await adminRest(`documents?application_id=eq.${appId}&kind=eq.resume&order=version.desc&limit=1&select=id,content`)) as {
    id: string;
    content: Content;
  }[];
  return rows[0]!;
}

async function saveContent(id: string, content: Content) {
  await adminRest(`documents?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ content }) });
}

test("download Word and PDF with flagged lines left out, even if the stored resume is tampered with", async ({ page }) => {
  await deniseReadyToWrite(page, "export");
  await writeResume(page);

  const label = page.getByTestId("fit-label");
  await expect(label).toHaveText(/^1 page · \d+(\.\d)?pt text, 0\.\d+" margins$/, { timeout: 20_000 });
  await expect(page.getByText("2 flagged lines are left out until you fix or review them.")).toBeVisible();

  const pdf = await pdfInfo(await saved(await downloadVia(page, "Download PDF")));
  expect(pdf.pages).toBe(1);
  expect(pdf.text).toContain("Denise Okafor");
  expect(pdf.text).toContain("Lead Custodian");
  expect(pdf.text).toContain("Build the weekly schedule");
  expect(pdf.text).not.toContain("Trained 12");
  expect(pdf.text).not.toContain("Managed supply ordering");
  expect(pdf.text).not.toContain("Microsoft Outlook");

  const wordDownload = await downloadVia(page, "Download Word");
  expect(wordDownload.suggestedFilename()).toMatch(/^Denise Okafor - St\. Brigid Medical Center\.docx$/);
  const word = await docxText(await saved(wordDownload));
  expect(word).toContain("Build the weekly schedule");
  expect(word).not.toContain("Trained 12");

  // Someone edits the stored document directly: marks the inflated line
  // "reviewed" and points it at a fact that doesn't exist. The server re-runs
  // Truth Guard on export, so it still stays out.
  const appId = applicationId(page);
  const doc = await latestResume(appId);
  for (const job of doc.content.jobs) {
    for (const b of job.bullets) {
      if (b.text.startsWith("Trained 12")) Object.assign(b, { reviewed: true, ai_check: { ok: true, issue: null }, fact_ids: ["00000000-0000-0000-0000-000000000000"] });
    }
  }
  await saveContent(doc.id, doc.content);
  const tampered = await page.request.get(`/api/documents/${doc.id}/export?format=pdf`);
  expect(tampered.status()).toBe(200);
  expect(Number(tampered.headers()["x-page-count"])).toBe(1);
  expect((await pdfInfo(await tampered.body())).text).not.toContain("Trained 12");

  // The API refuses to mark a line accurate when it relies on an unknown fact.
  const bulletId = doc.content.jobs.flatMap((j) => j.bullets).find((b) => b.text.startsWith("Trained 12"))!.id;
  const review = await page.request.patch(`/api/documents/${doc.id}`, { data: { op: "review", bulletId } });
  expect(review.status()).toBe(422);
});

test("strictly one page: blocks the download until lines are removed, then fits", async ({ page }) => {
  await deniseReadyToWrite(page, "strict");
  await writeResume(page);

  // Pad the resume with extra supported lines so it can't fit on one page.
  const appId = applicationId(page);
  const doc = await latestResume(appId);
  const first = doc.content.jobs[0]!;
  const source = first.bullets.find((b) => b.text.startsWith("Build the weekly schedule"))!;
  const letters = "ABCDEFGHIJKLMNOPQRSTUV".split("");
  first.bullets.push(
    ...letters.map((l) => ({
      ...source,
      id: `x${l}`,
      text: `Extra line ${l}: builds the weekly schedule for the crew and arranges coverage when staff call off, keeping every floor staffed overnight.`,
      relevance: 1,
      reviewed: false,
      ai_check: null,
    })),
  );
  await saveContent(doc.id, doc.content);
  await page.reload();
  await page.getByRole("tab", { name: "Resume" }).click();

  await page.getByRole("radio", { name: "Strictly one page" }).check();
  await expect(page.getByText(/^Removing these \d+ lines would fit one page:$/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeDisabled();
  // Nothing was removed for the person.
  await expect(line(page, /Line: Extra line A:/).getByRole("checkbox")).toBeChecked();

  const refused = await page.request.get(`/api/documents/${doc.id}/export?format=docx`);
  expect(refused.status()).toBe(422);
  expect((await refused.json()).error.code).toBe("does_not_fit");

  await page.getByRole("button", { name: /^Remove these \d+ lines$/ }).click();
  await expect(page.getByTestId("fit-label")).toHaveText(/^1 page · /, { timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeEnabled();
  const pdf = await pdfInfo(await saved(await downloadVia(page, "Download PDF")));
  expect(pdf.pages).toBe(1);
  // The cut lines stay in the editor, unchecked.
  await expect(line(page, /Line: Extra line V:/).getByRole("checkbox")).not.toBeChecked();
});

test("cover letter: Pro only, streams, edits save, downloads", async ({ page }) => {
  const email = await deniseReadyToWrite(page, "letter");
  const appId = applicationId(page);

  await page.getByRole("tab", { name: "Cover letter" }).click();
  await expect(page.getByText("This is a Pro feature")).toBeVisible();
  const blocked = await page.request.post(`/api/applications/${appId}/cover-letter`);
  expect(blocked.status()).toBe(402);

  await setPlan(email, "pro");
  await page.reload();
  await page.getByRole("tab", { name: "Cover letter" }).click();
  await page.getByRole("button", { name: "Write my cover letter" }).click();

  const field = page.getByLabel("Your cover letter");
  await expect(field).toHaveValue(/^Dear Hiring Manager,/, { timeout: 20_000 });
  await expect(page.getByText("Version 1. Saved.")).toBeVisible({ timeout: 20_000 });
  await expect(field).toHaveValue(/Sincerely,\nDenise Okafor$/);
  await expect(page.getByTestId("word-count")).toHaveText("238 words");
  await expect(page.getByText("Check these numbers")).toHaveCount(0);

  // Edit: autosaves, and a number no fact states gets a gentle note.
  const edited = (await field.inputValue()).replace("Thank you for your time.", "I have 27 years of experience. Thank you for your time.");
  await field.fill(edited);
  await expect(page.getByText(`"27" doesn't appear in your confirmed facts.`, { exact: false })).toBeVisible();
  await expect(page.getByText("Version 1. Saved.")).toBeVisible({ timeout: 10_000 });

  await page.reload();
  await page.getByRole("tab", { name: "Cover letter" }).click();
  await expect(page.getByLabel("Your cover letter")).toHaveValue(/I have 27 years of experience\./);

  const wordDownload = await downloadVia(page, "Download Word");
  expect(wordDownload.suggestedFilename()).toBe("Denise Okafor - St. Brigid Medical Center - Cover Letter.docx");
  expect(await docxText(await saved(wordDownload))).toContain("I have 27 years of experience.");
  const pdf = await pdfInfo(await saved(await downloadVia(page, "Download PDF")));
  expect(pdf.pages).toBe(1);
  expect(pdf.text).toContain("Dear Hiring Manager,");
});
