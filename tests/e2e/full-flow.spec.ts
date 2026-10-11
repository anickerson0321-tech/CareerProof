import { readFile } from "node:fs/promises";
import { expect, test, type Download } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import mammoth from "mammoth";
import { authUserStatus, signUp, userIdFor } from "./helpers/auth";
import { answerScheduleQuestion, compareJob, confirmAll, importDenise, line, writeResume } from "./helpers/flows";

// SPEC §14: the whole journey, on desktop and on a 375×812 phone.

const bytes = async (d: Download) => readFile(await d.path());

test("sign up → import → match → answer → resume → export → status → delete account", async ({ page }) => {
  // Sign up and add a resume.
  const email = await signUp(page, "journey");
  const userId = await userIdFor(email);
  await importDenise(page);
  await confirmAll(page);

  // New application, then answer a question.
  await compareJob(page);
  const applicationUrl = page.url();
  await answerScheduleQuestion(page);

  // Reload: the answer persisted and the requirement is now supported.
  await page.reload();
  const schedule = page.getByRole("article", { name: /Experience building staff schedules/ });
  await expect(schedule.getByText("Supported", { exact: true })).toBeVisible();
  await expect(schedule.getByRole("button", { name: "E26, confirmed" })).toBeVisible();

  // Write the resume: the inflated line is flagged and left out of the download.
  await writeResume(page);
  await expect(line(page, /Line: Trained 12 new hires/).getByText("Check this")).toBeVisible();
  await expect(page.getByText("2 flagged lines are left out until you fix or review them.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("fit-label")).toHaveText(/^1 page · /);

  // Export Word and PDF; the PDF is within the page target (one page if possible).
  const [pdfDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download PDF" }).click()]);
  const pdf = await PDFDocument.load(await bytes(pdfDownload));
  expect(pdf.getPageCount()).toBeLessThanOrEqual(1);
  const [wordDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download Word" }).click()]);
  const word = (await mammoth.extractRawText({ buffer: await bytes(wordDownload) })).value;
  expect(word).toContain("Build the weekly schedule");
  expect(word).not.toContain("Trained 12");

  // Change the application's status; it sticks.
  await page.goto("/applications");
  const status = page.getByLabel(/Status for Environmental Services Supervisor/);
  await status.selectOption("applied");
  await expect(status).toBeEnabled();
  await page.reload();
  await expect(page.getByLabel(/Status for Environmental Services Supervisor/)).toHaveValue("applied");
  await page.goto(applicationUrl);
  await expect(page.getByLabel("Status", { exact: true })).toHaveValue("applied");

  // Delete the account.
  await page.goto("/settings");
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await page.waitForURL("/account-deleted");
  expect(await authUserStatus(userId)).toBe(404);
});
