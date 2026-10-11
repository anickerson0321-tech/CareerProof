import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { signUp } from "./helpers/auth";

// M3: job analysis, Match tab, questions, answers reused by a second application.

const POSTING = readFileSync("tests/fixtures/postings/evs-supervisor.txt", "utf8");
const SCHEDULE_ANSWER =
  "Yes, I make the weekly schedule for my 6 person crew and I find someone to cover when people call off, usually 2 or 3 times a month.";

async function importResume(page: Page) {
  await page.locator("[data-intake-ready]").waitFor();
  await page.locator("#resume-file").setInputFiles("tests/fixtures/resumes/custodial-lead.txt");
  await page.getByRole("button", { name: "Read my resume" }).click();
  await page.waitForURL(/\/vault\?imported=/);
}

async function newApplication(page: Page) {
  await page.goto("/applications/new");
  await page.locator("[data-form-ready]").waitFor();
  await page.getByLabel("Job posting").fill(POSTING);
  await page.getByRole("button", { name: "Compare with my career" }).click();
  await expect(page.getByText("Comparing with your career…")).toBeVisible();
  await page.waitForURL(/\/applications\/[0-9a-f-]{36}$/);
}

const requirement = (page: Page, text: string) => page.getByRole("article", { name: new RegExp(text) });

test("compare a job, confirm from the match, answer a question, and reuse it", async ({ page }) => {
  await signUp(page, "match");
  await importResume(page);

  // Home after onboarding is the applications list, with an empty state and the vault warning.
  await page.goto("/start");
  await page.waitForURL(/\/applications$/);
  await expect(page.getByRole("heading", { name: "No applications yet" })).toBeVisible();
  await expect(page.getByText("28 items in your vault are waiting for you")).toBeVisible();

  await newApplication(page);
  await expect(page.getByRole("heading", { level: 1, name: "Environmental Services Supervisor (Nights)" })).toBeVisible();
  await expect(page.getByText("St. Brigid Medical Center").first()).toBeVisible();

  // Boilerplate is left out and named.
  await expect(page.getByText("Left out of matching:")).toBeVisible();
  for (const word of ["$54,000", "Equal Opportunity", "403(b)", "How to apply"]) {
    await expect(page.getByRole("article").filter({ hasText: word })).toHaveCount(0);
  }

  // Nothing is confirmed yet, so supported items wait for the person's OK.
  const lead = requirement(page, "Experience leading or supervising");
  await expect(lead.getByText("Needs your OK")).toBeVisible();
  await lead.getByRole("button", { name: "Confirm E3" }).click();
  await expect(lead.getByText("Supported", { exact: true })).toBeVisible();

  // Years come from merged dates; unconfirmed jobs hold it back until confirmed.
  const years = requirement(page, "At least 3 years");
  await expect(years.getByText(/at least \d+ yrs \d+ mos of relevant experience, overlapping months counted once\. This asks for 3\./)).toBeVisible();
  await page.goto("/vault");
  await page.getByRole("button", { name: /Confirm all/ }).click();
  await expect(page.getByText(/items? (is|are) waiting/)).toHaveCount(0);
  await page.goBack();
  await page.reload();
  await expect(requirement(page, "At least 3 years").getByText("Supported", { exact: true })).toBeVisible();
  await expect(page.getByText("5 of 6 required met")).toHaveCount(0);
  await expect(page.getByText("4 of 6 required met")).toBeVisible();

  // Fact chips show the fact and whether it's confirmed.
  await requirement(page, "Experience leading or supervising").getByRole("button", { name: "E3, confirmed" }).click();
  await expect(page.getByText("Confirmed by you")).toBeVisible();

  // Three questions, required first, none about what the vault already says.
  await expect(page.getByRole("heading", { name: "3 questions to fill the gaps" })).toBeVisible();
  const scheduleQ = page.getByRole("article", { name: /Question about Experience building staff schedules/ });
  await scheduleQ.getByRole("textbox").fill(SCHEDULE_ANSWER);
  await scheduleQ.getByRole("button", { name: "Save answer" }).click();

  // Saved to the vault as an unconfirmed fact, shown for the person to check.
  const added = page.getByRole("article", { name: /Your answer about Experience building staff schedules/ });
  await expect(added.getByText("Added to your vault as E26")).toBeVisible();
  await expect(added).toContainText("Builds the weekly schedule for a 6-person crew");
  await expect(requirement(page, "^R4: Experience building staff").getByText("Needs your OK")).toBeVisible();

  // It persists across a reload.
  await page.reload();
  await expect(page.getByText("Added to your vault as E26")).toBeVisible();
  await expect(page.getByRole("heading", { name: "2 questions to fill the gaps" })).toBeVisible();

  // "Looks right" confirms it and the requirement becomes supported.
  await page.getByRole("button", { name: "Looks right" }).click();
  await expect(page.getByText("Added to your vault as E26")).toHaveCount(0);
  await expect(requirement(page, "^R4: Experience building staff").getByText("Supported", { exact: true })).toBeVisible();
  await expect(page.getByText("5 of 6 required met")).toBeVisible();

  // "I don't have this" is the person's call, and can be undone.
  const jc = page.getByRole("article", { name: /Question about Experience preparing for Joint Commission/ });
  await jc.getByRole("button", { name: "I don't have this" }).click();
  const jcReq = requirement(page, "^R8: Experience preparing for Joint Commission");
  await expect(jcReq.getByText("You don't have this")).toBeVisible();
  await jcReq.getByRole("button", { name: "Undo" }).click();
  await expect(jcReq.getByText("Not in your record yet")).toBeVisible();

  // The answer is in the vault, under "From your answers".
  await page.goto("/vault#fact-E26");
  await expect(page.locator("#fact-E26")).toContainText("Builds the weekly schedule");
  await expect(page.locator("#fact-E26")).toContainText("From your answer");

  // A second application reuses the answer: R4 is supported by E26 and not asked again.
  await newApplication(page);
  await expect(requirement(page, "^R4: Experience building staff").getByText("Supported", { exact: true })).toBeVisible();
  await expect(requirement(page, "^R4: Experience building staff").getByRole("button", { name: "E26, confirmed" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "2 questions to fill the gaps" })).toBeVisible();
  await expect(page.getByRole("article", { name: /Question about Experience building staff schedules/ })).toHaveCount(0);

  // Applications list: both, with scores and a status that sticks.
  await page.goto("/applications");
  await expect(page.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByText("5 of 6 required met")).toHaveCount(2);
  const status = page.getByLabel(/Status for Environmental Services Supervisor/).first();
  await status.selectOption("applied");
  await expect(status).toBeEnabled();
  await page.reload();
  await expect(page.getByLabel(/Status for Environmental Services Supervisor/).first()).toHaveValue("applied");

  // Free plan: 2 applications, then an upgrade prompt rather than a dead end.
  await page.goto("/applications/new");
  await expect(page.getByText("The free plan includes 2 applications.")).toBeVisible();
  await expect(page.getByRole("link", { name: "See Pro plans" })).toBeVisible();
});
