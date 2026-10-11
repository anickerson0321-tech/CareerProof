import { expect, test, type APIRequestContext } from "@playwright/test";
import Stripe from "stripe";
import { adminRest, signUp, userIdFor } from "./helpers/auth";
import { compareJob, confirmAll, EVS_POSTING, importDenise } from "./helpers/flows";

// M7: Billing. Real Stripe needs your test keys; here the webhook is driven
// with events signed by the same local secret the test server uses.

const SECRET = "whsec_e2e_local_only";
const DAY = 86_400;

async function sendEvent(request: APIRequestContext, event: object, secret = SECRET) {
  const payload = JSON.stringify(event);
  const header = await Stripe.webhooks.generateTestHeaderStringAsync({ payload, secret });
  return request.post("/api/stripe/webhook", { data: payload, headers: { "stripe-signature": header, "content-type": "application/json" } });
}

function subscriptionEvent(id: string, type: string, created: number, userId: string, fields: Record<string, unknown>) {
  return {
    id,
    object: "event",
    type,
    created,
    data: {
      object: {
        id: "sub_e2e",
        object: "subscription",
        customer: `cus_${userId.slice(0, 8)}`,
        status: "active",
        cancel_at_period_end: false,
        metadata: { user_id: userId },
        items: { data: [{ current_period_end: created + 30 * DAY }] },
        ...fields,
      },
    },
  };
}

async function profile(userId: string) {
  const rows = (await adminRest(`profiles?user_id=eq.${userId}&select=plan,subscription_status,stripe_customer_id,current_period_end`)) as {
    plan: string;
    subscription_status: string | null;
    stripe_customer_id: string | null;
    current_period_end: string | null;
  }[];
  return rows[0]!;
}

test("a free user hits the limit, upgrades, and gets Pro right away; later changes follow Stripe", async ({ page }) => {
  const email = await signUp(page, "billing");
  const userId = await userIdFor(email);
  await importDenise(page);
  await confirmAll(page);
  await compareJob(page);
  await compareJob(page);

  // The third application hits the free limit: an explanation, not a dead end.
  await page.goto("/applications/new");
  await expect(page.getByText("This is a Pro feature")).toBeVisible();
  await expect(page.getByText("The free plan includes 2 applications.", { exact: false })).toBeVisible();
  // The server enforces it too.
  const refused = await page.request.post("/api/applications", { data: { postingText: EVS_POSTING } });
  expect(refused.status()).toBe(402);
  expect((await refused.json()).error).toMatchObject({ code: "limit_applications", upgrade: true });
  await page.getByRole("link", { name: "See Pro plans" }).click();
  await page.waitForURL("/upgrade");
  await expect(page.getByRole("heading", { name: "Upgrade to Pro", level: 1 })).toBeVisible();
  // No Stripe keys in this environment, so the page says so instead of a broken button.
  await expect(page.getByText("Upgrades aren't available on this copy of CareerProof yet.", { exact: false })).toBeVisible();

  // Stripe confirms the checkout.
  const now = Math.floor(Date.now() / 1000);
  const checkout = {
    id: `evt_checkout_${userId}`,
    object: "event",
    type: "checkout.session.completed",
    created: now,
    data: {
      object: {
        id: "cs_test_e2e",
        object: "checkout.session",
        mode: "subscription",
        payment_status: "paid",
        customer: `cus_${userId.slice(0, 8)}`,
        subscription: "sub_e2e",
        client_reference_id: userId,
      },
    },
  };
  expect((await sendEvent(page.request, checkout)).status()).toBe(200);
  expect((await profile(userId)).plan).toBe("pro");

  // Pro access is immediate: the third application goes through.
  await compareJob(page);
  await page.goto("/upgrade");
  await expect(page.getByText("You have Pro")).toBeVisible();

  // A retried delivery is a no-op.
  const again = await sendEvent(page.request, checkout);
  expect(await again.json()).toMatchObject({ duplicate: true });

  // Bad signatures are refused.
  expect((await sendEvent(page.request, checkout, "whsec_wrong")).status()).toBe(400);
  const unsigned = await page.request.post("/api/stripe/webhook", { data: JSON.stringify(checkout) });
  expect(unsigned.status()).toBe(400);

  // The subscription's renewal date arrives, then the person schedules a cancellation.
  await sendEvent(page.request, subscriptionEvent(`evt_created_${userId}`, "customer.subscription.created", now + 1, userId, {}));
  await sendEvent(page.request, subscriptionEvent(`evt_cancel_${userId}`, "customer.subscription.updated", now + 60, userId, { cancel_at_period_end: true }));
  expect(await profile(userId)).toMatchObject({ plan: "pro", subscription_status: "canceling" });
  await page.goto("/settings");
  const plan = page.getByRole("region", { name: "Plan & usage" });
  await expect(plan.getByText("Pro", { exact: true })).toBeVisible();
  await expect(plan.getByText(/^Ends /)).toBeVisible();
  await expect(plan.getByRole("button", { name: "Manage billing" })).toBeVisible();

  // A stale event delivered late doesn't undo the newer change.
  await sendEvent(page.request, subscriptionEvent(`evt_stale_${userId}`, "customer.subscription.updated", now + 30, userId, {}));
  expect((await profile(userId)).subscription_status).toBe("canceling");

  // The subscription ends: back to Free, nothing deleted.
  await sendEvent(page.request, subscriptionEvent(`evt_deleted_${userId}`, "customer.subscription.deleted", now + 120, userId, { status: "canceled" }));
  expect(await profile(userId)).toMatchObject({ plan: "free", subscription_status: "canceled" });
  await page.goto("/applications");
  await expect(page.getByRole("link", { name: /Environmental Services Supervisor/ })).toHaveCount(3);
});
