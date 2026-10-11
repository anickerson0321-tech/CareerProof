import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { setPlan } from "./helpers/auth";
import { deniseReadyToWrite, writeResume } from "./helpers/flows";

// M8: automated accessibility checks (WCAG 2.1 A and AA rules in axe) on
// every screen, in light and dark themes.

async function expectNoViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
  expect(summary, `${label}\n${summary.join("\n")}`).toEqual([]);
}

/** On a phone, nothing should make the page scroll sideways. */
async function expectNoSidewaysScroll(page: Page, label: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(0);
}

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((t) => {
    localStorage.setItem("cp-theme", t);
    document.documentElement.setAttribute("data-theme", t);
  }, theme);
}

for (const theme of ["light", "dark"] as const) {
  test(`public pages have no accessibility violations (${theme})`, async ({ page }) => {
    for (const path of ["/", "/demo", "/demo/application", "/login", "/login?mode=signup", "/privacy", "/terms", "/contact", "/no-such-page"]) {
      await page.goto(path);
      await setTheme(page, theme);
      await expect(page.locator("main")).toBeVisible();
      await expectNoViolations(page, `${path} (${theme})`);
      await expectNoSidewaysScroll(page, path);
    }
  });
}

test("signed-in screens have no accessibility violations", async ({ page }) => {
  const email = await deniseReadyToWrite(page, "a11y");
  await setPlan(email, "pro");
  await writeResume(page);
  await expect(page.getByTestId("fit-label")).toHaveText(/page/, { timeout: 20_000 });
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme);
    for (const tab of ["Match", "Resume", "Cover letter", "Posting"]) {
      await page.getByRole("tab", { name: tab }).click();
      await expectNoViolations(page, `workspace ${tab} (${theme})`);
      await expectNoSidewaysScroll(page, `workspace ${tab}`);
    }
  }
  const workspace = page.url();
  for (const path of ["/applications", "/applications/new", "/vault", "/settings", "/upgrade", "/onboarding"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expectNoViolations(page, path);
    await expectNoSidewaysScroll(page, path);
  }
  await page.goto(workspace);
});
