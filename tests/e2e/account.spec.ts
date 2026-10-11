import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { adminRest, authUserStatus, signUp, storedFiles, userIdFor } from "./helpers/auth";
import { compareJob, confirmAll, importDenise } from "./helpers/flows";

// M6: Account settings, data export and deletion.

const TABLES = [
  "profiles",
  "source_documents",
  "jobs",
  "facts",
  "fact_revisions",
  "applications",
  "requirements",
  "requirement_evidence",
  "documents",
  "ai_calls",
];

async function rowCounts(userId: string) {
  const counts: Record<string, number> = {};
  for (const table of TABLES) {
    counts[table] = ((await adminRest(`${table}?user_id=eq.${userId}&select=user_id`)) as unknown[]).length;
  }
  return counts;
}

test("edit details, download my data, then delete the account and everything in it", async ({ page }) => {
  const email = await signUp(page, "account");
  const userId = await userIdFor(email);
  await importDenise(page);
  await confirmAll(page);
  await compareJob(page);

  // Details used on documents.
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  await page.locator("form[data-form-ready]").waitFor();
  await expect(page.getByLabel("Full name")).toHaveValue("Denise Okafor");
  await page.getByLabel("Phone").fill("(555) 000-1234");
  await page.getByLabel("Email on your documents").fill("not an email");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Enter an email address like name@example.com, or leave it blank.")).toBeVisible();
  await page.getByLabel("Email on your documents").fill("denise@example.com");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Saved. New downloads will use these details.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Phone")).toHaveValue("(555) 000-1234");
  await expect(page.getByLabel("Email on your documents")).toHaveValue("denise@example.com");

  // Usage on the free plan.
  const plan = page.getByRole("region", { name: "Plan & usage" });
  await expect(plan.getByText("Free", { exact: true })).toBeVisible();
  await expect(plan.getByText("1 of 2 used")).toBeVisible();
  await expect(plan.getByText("1 of 1 used")).toBeVisible();

  // Download my data.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download my data" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^careerproof-data-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(data.profile.phone).toBe("(555) 000-1234");
  expect(data.vault.facts.length).toBeGreaterThan(20);
  expect(data.vault.jobs.map((j: { title: string }) => j.title)).toContain("Lead Custodian");
  expect(data.applications).toHaveLength(1);
  expect(data.applications[0].requirements.length).toBeGreaterThan(5);
  expect(JSON.stringify(data)).not.toContain("stripe_customer_id");

  // There is something to delete in every place.
  const before = await rowCounts(userId);
  for (const table of ["profiles", "source_documents", "jobs", "facts", "applications", "requirements", "requirement_evidence", "ai_calls"]) {
    expect(before[table], table).toBeGreaterThan(0);
  }
  expect((await storedFiles(userId)).length).toBeGreaterThan(0);

  // Typed confirmation.
  const remove = page.getByRole("button", { name: "Delete my account" });
  await expect(remove).toBeDisabled();
  await page.getByLabel("Type DELETE to confirm").fill("delete");
  await expect(remove).toBeDisabled();
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await remove.click();
  await page.waitForURL("/account-deleted");
  await expect(page.getByRole("heading", { name: "Your account is deleted" })).toBeVisible();

  // Every row and file is gone, and so is the sign-in.
  expect(Object.values(await rowCounts(userId)).every((n) => n === 0)).toBe(true);
  expect(await storedFiles(userId)).toEqual([]);
  expect(await authUserStatus(userId)).toBe(404);
  await page.goto("/vault");
  await page.waitForURL(/\/login/);
});

test("the delete API needs the typed confirmation", async ({ page }) => {
  await signUp(page, "nodelete");
  const response = await page.request.delete("/api/account", { data: { confirm: "yes" } });
  expect(response.status()).toBe(400);
  expect((await response.json()).error.message).toBe("Type DELETE to confirm.");
});
