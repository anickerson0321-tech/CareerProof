import { expect, test } from "@playwright/test";
import { signInLinkFor, uniqueEmail } from "./helpers/mail";

test.describe("landing page", () => {
  test("shows the promise, steps, example, pricing and FAQ", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Your career, on the record." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Get started free" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "See an example" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();
    for (const step of ["Build your vault", "Paste a job", "Download your resume"]) {
      await expect(page.getByRole("heading", { name: step })).toBeVisible();
    }
    await expect(page.getByText("Supported", { exact: true })).toBeVisible();
    await expect(page.getByText("Partly supported", { exact: true })).toBeVisible();
    await expect(page.getByText("Confirmed means you confirmed it. CareerProof won't write a line your facts don't support.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pricing" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Questions" })).toBeVisible();
    for (const link of ["Privacy", "Terms", "Contact"]) {
      await expect(page.getByRole("contentinfo").getByRole("link", { name: link })).toBeVisible();
    }
  });

  test("privacy, terms and contact pages have real content", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: "How your resume is processed" })).toBeVisible();
    await page.goto("/terms");
    await expect(page.getByRole("heading", { name: "You're responsible for what's true" })).toBeVisible();
    await page.goto("/contact");
    await expect(page.getByRole("heading", { level: 1, name: "Contact" })).toBeVisible();
  });
});

test.describe("demo", () => {
  test("vault shows sample data with an unconfirmed item", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "See an example" }).click();
    await expect(page.getByText("Sample data for a made-up person.")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Jordan Rivera" })).toBeVisible();
    await expect(page.getByText("10 yrs 7 mos")).toBeVisible();
    await expect(page.getByText("Check these over, then confirm.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm all 1" })).toBeDisabled();
    await expect(page.getByText("Microsoft Teams")).toBeVisible();
  });

  test("application shows every status type, two questions and a flagged bullet", async ({ page }) => {
    await page.goto("/demo/application");
    await expect(page.getByRole("heading", { level: 1, name: "Training & Compliance Coordinator" })).toBeVisible();
    for (const label of ["Supported", "Partly supported", "Needs your OK", "Not in your record yet", "You don't have this"]) {
      await expect(page.getByRole("article").getByText(label, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: "2 questions to fill the gaps" })).toBeVisible();
    await expect(page.getByText("This asks for 3.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm E12" })).toBeDisabled();

    // Fact chips expand to show the fact and whether it's confirmed.
    await page.getByRole("button", { name: "E12, not confirmed yet" }).click();
    await expect(page.getByText("Not confirmed yet")).toBeVisible();

    await page.getByRole("tab", { name: "Resume" }).click();
    await expect(page.getByText("1 line needs a look.")).toBeVisible();
    await expect(page.getByText("Managed LMS training compliance for the evening custodial team.")).toBeVisible();
    await expect(page.getByText("Check this", { exact: true })).toBeVisible();

    await page.getByRole("tab", { name: "Posting" }).click();
    await expect(page.getByText("Mercy Valley Health is an equal opportunity employer.", { exact: false })).toBeVisible();
  });
});

test.describe("sign up", () => {
  test("a new user signs up with a magic link and lands on onboarding", async ({ page }) => {
    const email = uniqueEmail();
    await page.goto("/");
    await page.getByRole("link", { name: "Get started free" }).first().click();
    await expect(page.getByRole("heading", { name: "Create your free account" })).toBeVisible();
    await page.getByLabel("Email address").fill(email);
    await page.getByRole("button", { name: "Email me a sign-in link" }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

    const link = await signInLinkFor(email);
    await page.goto(link);
    await page.waitForURL("**/onboarding");
    await expect(page.getByRole("heading", { level: 1, name: /Let's build your Career Vault/ })).toBeVisible();

    // Signed-in users skip the sign-in page; signed-out users can't reach onboarding.
    await page.goto("/login");
    await page.waitForURL("**/onboarding");
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL((url) => url.pathname === "/");
    await page.goto("/onboarding");
    await page.waitForURL("**/login?next=%2Fonboarding");
  });

  test("an expired link explains what to do", async ({ page }) => {
    await page.goto("/auth/callback?code=not-a-real-code");
    await expect(page.getByText("That sign-in link has expired or was already used.")).toBeVisible();
  });
});
