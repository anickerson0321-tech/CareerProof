import { expect, test } from "@playwright/test";
import { deniseReadyToWrite, line, writeResume } from "./helpers/flows";

// M4: Resume Studio + Truth Guard.

test("write a resume where every line cites confirmed facts, and fix what Truth Guard flags", async ({ page }) => {
  await deniseReadyToWrite(page, "studio");
  await writeResume(page);

  const preview = page.getByRole("article", { name: "Resume preview" });
  // Titles, employers and dates are printed from the vault.
  await expect(preview.getByText("Lead Custodian", { exact: true })).toBeVisible();
  await expect(preview.getByText("Mar 2020 – Present")).toBeVisible();
  await expect(preview.getByText("Kettering Valley Hospital, Dayton, OH")).toBeVisible();
  // Education and certifications from confirmed vault facts; skills only if cited.
  await expect(preview.getByText("Certified Healthcare Environmental Services Technician (CHEST), 2022.")).toBeVisible();
  await expect(preview.getByText(/Infection control • Chemical safety/)).toBeVisible();
  await expect(preview.getByText("Microsoft Outlook")).toHaveCount(0);

  // Two inflated lines are flagged and kept out of the download.
  await expect(page.getByText("2 lines need a look.")).toBeVisible();
  const twelve = line(page, /Line: Trained 12 new hires/);
  await expect(twelve.getByText("Check this")).toBeVisible();
  await expect(twelve.getByText("The cited fact says you trained 9 new hires, not 12.")).toBeVisible();
  await expect(twelve.getByText(`"12" isn't in the facts this line is based on.`)).toBeVisible();
  const managed = line(page, /Line: Managed supply ordering/);
  await expect(managed.getByText(`"managed" suggests you were in charge, but the facts behind this line don't say that.`)).toBeVisible();

  // Every other line is supported and shows its facts.
  const schedule = line(page, /Line: Build the weekly schedule/);
  await expect(schedule.getByText("Supported", { exact: true })).toBeVisible();
  await schedule.getByRole("button", { name: "E26, confirmed" }).click();
  await expect(schedule.getByText("Confirmed by you")).toBeVisible();

  // Edit the inflated number: the old check clears and code checks re-run at once.
  await twelve.getByRole("button", { name: /^Edit line/ }).click();
  await page.getByLabel(/^Edit line: Trained 12 new hires/).fill("Trained 9 new hires on chemical safety, PPE and isolation-room cleaning.");
  await page.getByRole("heading", { level: 1 }).click(); // click away saves
  const nine = line(page, /Line: Trained 9 new hires/);
  await expect(nine.getByText("Supported", { exact: true })).toBeVisible();
  await expect(page.getByText("1 line needs a look.")).toBeVisible();

  // "It's accurate" is the person's call for a soft flag.
  await managed.getByRole("button", { name: /It's accurate/ }).click();
  await expect(managed.getByText("Reviewed by you")).toBeVisible();
  await expect(page.getByText("Every included line is backed by a confirmed fact.")).toBeVisible();

  // Unchecking a line leaves the fact in the vault.
  await line(page, /Line: Cleaned classrooms and hallways/).getByRole("checkbox").click();
  await expect(line(page, /Line: Cleaned classrooms and hallways/).getByText("Left out of this resume. The fact stays in your vault.")).toBeVisible();

  // Everything persists.
  await page.reload();
  await page.getByRole("tab", { name: "Resume" }).click();
  await expect(line(page, /Line: Trained 9 new hires/)).toBeVisible();
  await expect(line(page, /Line: Managed supply ordering/).getByText("Reviewed by you")).toBeVisible();
  await expect(line(page, /Line: Cleaned classrooms and hallways/).getByRole("checkbox")).not.toBeChecked();
  await expect(page.getByText("Version 1.")).toBeVisible();

  // Rewrite makes a fresh version (the old one is kept).
  await page.getByRole("button", { name: "Rewrite" }).click();
  await expect(page.getByText("Version 2.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("2 lines need a look.")).toBeVisible();

  // The vault fact was never changed by editing the resume.
  await page.goto("/vault#fact-E5");
  await expect(page.locator("#fact-E5")).toContainText("Trained 9 new hires on chemical safety, PPE and isolation room cleaning.");
});
