import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { signUp } from "./auth";

export const EVS_POSTING = readFileSync("tests/fixtures/postings/evs-supervisor.txt", "utf8");
export const SCHEDULE_ANSWER =
  "Yes, I make the weekly schedule for my 6 person crew and I find someone to cover when people call off, usually 2 or 3 times a month.";

export async function importDenise(page: Page) {
  await page.locator("[data-intake-ready]").waitFor();
  await page.locator("#resume-file").setInputFiles("tests/fixtures/resumes/custodial-lead.txt");
  await page.getByRole("button", { name: "Read my resume" }).click();
  await page.waitForURL(/\/vault\?imported=/);
}

export async function confirmAll(page: Page) {
  await page.goto("/vault");
  await page.getByRole("button", { name: /Confirm all/ }).click();
  await expect(page.getByText(/items? (is|are) waiting/)).toHaveCount(0);
}

export async function compareJob(page: Page, posting = EVS_POSTING) {
  await page.goto("/applications/new");
  await page.locator("[data-form-ready]").waitFor();
  await page.getByLabel("Job posting").fill(posting);
  await page.getByRole("button", { name: "Compare with my career" }).click();
  await page.waitForURL(/\/applications\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

export async function answerScheduleQuestion(page: Page) {
  const q = page.getByRole("article", { name: /Question about Experience building staff schedules/ });
  await q.getByRole("textbox").fill(SCHEDULE_ANSWER);
  await q.getByRole("button", { name: "Save answer" }).click();
  await expect(page.getByText("Added to your vault as E26")).toBeVisible();
  await page.getByRole("button", { name: "Looks right" }).click();
  await expect(page.getByText("Added to your vault as E26")).toHaveCount(0);
}

/** Sign up → import Denise's resume → confirm all → compare the EVS job → answer the schedule question. */
export async function deniseReadyToWrite(page: Page, prefix = "flow") {
  const email = await signUp(page, prefix);
  await importDenise(page);
  await confirmAll(page);
  await compareJob(page);
  await answerScheduleQuestion(page);
  return email;
}

export async function writeResume(page: Page) {
  await page.getByRole("tab", { name: "Resume" }).click();
  await page.getByRole("button", { name: "Write my resume" }).click();
  await expect(page.getByText("Writing your resume…")).toBeVisible();
  await expect(page.getByRole("article", { name: "Resume preview" })).toBeVisible({ timeout: 30_000 });
}

export const line = (page: Page, text: string | RegExp) => page.getByRole("listitem", { name: typeof text === "string" ? `Line: ${text}` : text });
