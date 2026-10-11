import { describe, expect, it } from "vitest";
import Stripe from "stripe";
import { billingChangeFor, planForStatus } from "@/lib/billing/webhook";

const SECRET = "whsec_unit_test_secret";

async function signed(payload: object) {
  const body = JSON.stringify(payload);
  const header = await Stripe.webhooks.generateTestHeaderStringAsync({ payload: body, secret: SECRET });
  return { body, header };
}

function subscriptionEvent(type: string, overrides: Record<string, unknown> = {}, created = 1_790_000_000) {
  return {
    id: `evt_${type}_${created}`,
    object: "event",
    type,
    created,
    data: {
      object: {
        id: "sub_123",
        object: "subscription",
        customer: "cus_123",
        status: "active",
        cancel_at_period_end: false,
        metadata: { user_id: "user-1" },
        items: { data: [{ current_period_end: 1_792_592_000 }] },
        ...overrides,
      },
    },
  };
}

describe("Stripe webhook signatures", () => {
  it("accepts a correctly signed event", async () => {
    const { body, header } = await signed(subscriptionEvent("customer.subscription.updated"));
    const event = await Stripe.webhooks.constructEventAsync(body, header, SECRET);
    expect(event.type).toBe("customer.subscription.updated");
  });

  it("rejects a tampered body or the wrong secret", async () => {
    const { body, header } = await signed(subscriptionEvent("customer.subscription.updated"));
    await expect(Stripe.webhooks.constructEventAsync(body.replace("active", "trialing"), header, SECRET)).rejects.toThrow();
    await expect(Stripe.webhooks.constructEventAsync(body, header, "whsec_other")).rejects.toThrow();
  });
});

describe("billing changes from events", () => {
  it("checkout completion grants Pro to the user who started it", () => {
    const change = billingChangeFor({
      id: "evt_1",
      type: "checkout.session.completed",
      created: 1_790_000_000,
      data: { object: { mode: "subscription", customer: "cus_123", subscription: "sub_123", client_reference_id: "user-1", payment_status: "paid" } },
    } as unknown as Stripe.Event);
    expect(change).toMatchObject({
      source: "checkout",
      userId: "user-1",
      patch: { plan: "pro", stripe_customer_id: "cus_123", stripe_subscription_id: "sub_123", subscription_status: "active" },
    });
  });

  it("ignores unpaid or one-off checkouts", () => {
    const base = { id: "evt", type: "checkout.session.completed", created: 1, data: { object: { customer: "cus_1", client_reference_id: "u" } } };
    expect(billingChangeFor({ ...base, data: { object: { ...base.data.object, mode: "payment" } } } as unknown as Stripe.Event)).toBeNull();
    expect(
      billingChangeFor({ ...base, data: { object: { ...base.data.object, mode: "subscription", payment_status: "unpaid" } } } as unknown as Stripe.Event),
    ).toBeNull();
  });

  it("maps subscription status to plan, with the renewal date", () => {
    const change = billingChangeFor(subscriptionEvent("customer.subscription.updated") as unknown as Stripe.Event)!;
    expect(change.patch).toMatchObject({ plan: "pro", subscription_status: "active", current_period_end: new Date(1_792_592_000_000).toISOString() });
    expect(change.at).toBe(new Date(1_790_000_000_000).toISOString());
  });

  it("marks a scheduled cancellation but keeps Pro until it ends", () => {
    const change = billingChangeFor(subscriptionEvent("customer.subscription.updated", { cancel_at_period_end: true }) as unknown as Stripe.Event)!;
    expect(change.patch).toMatchObject({ plan: "pro", subscription_status: "canceling" });
  });

  it("drops to Free when the subscription ends or can't be paid", () => {
    expect(billingChangeFor(subscriptionEvent("customer.subscription.deleted") as unknown as Stripe.Event)!.patch).toMatchObject({
      plan: "free",
      subscription_status: "canceled",
    });
    expect(billingChangeFor(subscriptionEvent("customer.subscription.updated", { status: "unpaid" }) as unknown as Stripe.Event)!.patch.plan).toBe("free");
  });

  it("keeps Pro while Stripe retries a failed card", () => {
    expect(planForStatus("past_due")).toBe("pro");
    expect(planForStatus("trialing")).toBe("pro");
    expect(planForStatus("incomplete")).toBe("free");
    expect(planForStatus("incomplete_expired")).toBe("free");
    expect(planForStatus("paused")).toBe("free");
  });

  it("ignores events it doesn't handle", () => {
    expect(billingChangeFor({ id: "e", type: "invoice.paid", created: 1, data: { object: {} } } as unknown as Stripe.Event)).toBeNull();
  });
});
