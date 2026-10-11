"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { api } from "@/lib/api/client";
import { PRO_PRICES } from "@/lib/billing/plans";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/common/notice";

type Interval = "monthly" | "yearly";

/** Choose monthly or yearly, then go to Stripe Checkout. */
export function UpgradeButton() {
  const hydrated = useHydrated();
  const [interval, setInterval] = useState<Interval>("monthly");
  const [going, setGoing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setGoing(true);
    setError(null);
    try {
      const { url } = await api<{ url: string }>("/api/stripe/checkout", { body: { interval } });
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't open checkout. Please try again.");
      setGoing(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="font-semibold">Billing</legend>
        {(["monthly", "yearly"] as const).map((value) => {
          const price = PRO_PRICES[value];
          return (
            <label
              key={value}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-strong-tint"
            >
              <input
                type="radio"
                name="interval"
                value={value}
                checked={interval === value}
                onChange={() => setInterval(value)}
                className="size-5 accent-[var(--primary)]"
              />
              <span>
                <span className="font-semibold">
                  {price.label} per {price.per}
                </span>
                {"note" in price && <span className="text-fg-muted"> · {price.note}</span>}
              </span>
            </label>
          );
        })}
      </fieldset>
      {error && <Notice tone="error">{error}</Notice>}
      <Button size="lg" onClick={go} disabled={!hydrated || going}>
        <Sparkles className="size-5" aria-hidden /> {going ? "Opening checkout…" : "Upgrade to Pro"}
      </Button>
      <p className="text-sm text-fg-muted">Secure checkout by Stripe. Cancel any time from Settings.</p>
    </div>
  );
}

/** Opens Stripe's Customer Portal to change or cancel the plan. */
export function ManageBillingButton() {
  const hydrated = useHydrated();
  const [going, setGoing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setGoing(true);
    setError(null);
    try {
      const { url } = await api<{ url: string }>("/api/stripe/portal", { method: "POST" });
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't open billing. Please try again.");
      setGoing(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" className="self-start" onClick={go} disabled={!hydrated || going}>
        {going ? "Opening…" : "Manage billing"}
      </Button>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
