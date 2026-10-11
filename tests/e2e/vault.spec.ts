import { expect, test } from "@playwright/test";
import { setPlan, signUp } from "./helpers/auth";

// M2: resume import + Career Vault, end to end with recorded AI responses.

const RESUME = "tests/fixtures/resumes/custodial-lead.txt";

test("import a resume, review the vault, and re-import without duplicates", async ({ page }) => {
  const email = await signUp(page, "vault");
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.locator("[data-intake-ready]").waitFor();

  // Upload → see exactly what was read.
  await page.locator("#resume-file").setInputFiles(RESUME);
  await expect(page.getByRole("heading", { name: "Here's what we read" })).toBeVisible();
  await expect(page.getByLabel("Text read from your resume")).toContainText("Kettering Valley Hospital");

  // Read my resume → vault with everything waiting for review.
  await page.getByRole("button", { name: "Read my resume" }).click();
  await expect(page.getByText("Reading your resume…")).toBeVisible();
  await page.waitForURL(/\/vault\?imported=/);
  await expect(page.getByText("Added 25 new facts and 3 new jobs to your vault")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Denise Okafor" })).toBeVisible();
  await expect(page.getByText("Check these over, then confirm. 28 items are waiting.")).toBeVisible();

  // Jobs newest first, with dates and durations from code.
  const jobs = page.getByRole("article");
  await expect(jobs.first()).toContainText("Lead Custodian");
  await expect(jobs.first()).toContainText("Mar 2020 – Present");
  await expect(
    page.getByText("Building Maintenance Certificate coursework, Sinclair Community College. Attended; not completed", { exact: false }).first(),
  ).toBeVisible();

  // Confirm all, and it survives a reload.
  await page.getByRole("button", { name: "Confirm all 28" }).click();
  await expect(page.getByText(/items? (is|are) waiting/)).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(/items? (is|are) waiting/)).toHaveCount(0);
  await expect(page.getByText("Confirmed facts").locator("..")).toContainText("25");

  // Edit a fact.
  await page.getByRole("button", { name: "Edit E5" }).click();
  await page.getByLabel("Edit E5").fill("Trained 9 new hires on chemical safety, PPE and isolation-room cleaning.");
  await page.getByRole("button", { name: "Save and confirm" }).click();
  await expect(page.getByText("Trained 9 new hires on chemical safety, PPE and isolation-room cleaning.")).toBeVisible();

  // Remove a fact with an inline two-step confirm (no browser dialog).
  await page.getByRole("button", { name: "Remove E25" }).click();
  await expect(page.getByRole("group", { name: "Remove E25?" })).toBeVisible();
  await page.getByRole("group", { name: "Remove E25?" }).getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Bilingual: English and Igbo")).toHaveCount(0);

  // Add a fact yourself → saved as confirmed.
  await page.getByRole("button", { name: "Add a fact yourself" }).click();
  await page.getByLabel("What kind of fact?").selectOption("accomplishment");
  await page.getByLabel("Which job? (optional)").selectOption({ label: "Lead Custodian · Kettering Valley Hospital" });
  await page.getByLabel("The fact, in one sentence").fill("Passed 3 Joint Commission environment-of-care surveys with no findings.");
  await page.getByRole("button", { name: "Add to my vault" }).click();
  await expect(page.getByText("Passed 3 Joint Commission environment-of-care surveys with no findings.")).toBeVisible();
  await expect(page.getByText("Added by you")).toBeVisible();

  // Edit job dates (validated in code).
  await page.getByRole("button", { name: "Edit job details for Part-time Custodian" }).click();
  await page.getByLabel("Started").fill("June 2014");
  await page.getByRole("button", { name: "Save and confirm" }).click();
  await expect(page.getByText("Dates need to look like 2019-06, 2019, or present.")).toBeVisible();
  await page.getByLabel("Started").fill("2014-09");
  await page.getByLabel("Ended").fill("2016-06");
  await page.getByRole("button", { name: "Save and confirm" }).click();
  await expect(page.getByText("Sep 2014 – Jun 2016")).toBeVisible();

  // Free plan: one import. "Add another resume" offers the upgrade instead of a dead end.
  await page.getByRole("link", { name: "Add another resume" }).click();
  await expect(page.getByText("The free plan includes one resume import.")).toBeVisible();
  await expect(page.getByRole("link", { name: "See Pro plans" })).toBeVisible();

  // On Pro, re-importing the same resume adds nothing and doesn't bring back the removed fact.
  await setPlan(email, "pro");
  await page.reload();
  await page.locator("[data-intake-ready]").waitFor();
  await page.locator("#resume-file").setInputFiles(RESUME);
  await page.getByRole("button", { name: "Read my resume" }).click();
  await page.waitForURL(/\/vault\?imported=/);
  await expect(page.getByText("Nothing new in that resume")).toBeVisible();
  await expect(page.getByText("24 facts were already in your vault")).toBeVisible();
  await expect(page.getByText("Bilingual: English and Igbo")).toHaveCount(0);
  await expect(page.getByText(/items? (is|are) waiting/)).toHaveCount(0);
});

test("bad files get a clear explanation", async ({ page }) => {
  await signUp(page, "badfile");
  await page.locator("[data-intake-ready]").waitFor();
  await page.locator("#resume-file").setInputFiles("tests/fixtures/files/scanned.pdf");
  await expect(page.getByText("This PDF looks like a scan")).toBeVisible();
  await expect(page.getByRole("button", { name: "Read my resume" })).toHaveCount(0);

  await page.getByRole("button", { name: "Try another file or paste" }).click();
  await page.locator("#resume-file").setInputFiles("tests/fixtures/files/old.doc");
  await expect(page.getByText("This is an older Word file (.doc)")).toBeVisible();

  await page.getByRole("button", { name: "Try another file or paste" }).click();
  await page.getByRole("button", { name: "Paste text" }).click();
  await page.getByLabel("Paste your whole resume").fill("Ma1colm Reyes\nqzxw prtk vbnm ghjk tcvb nmlk zxcv bnmq wrtp (cid:3) (cid:9)");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(/We can't use this file|Please check this/).first()).toBeVisible();
  await expect(page.getByText(/scrambled/)).toBeVisible();
});
