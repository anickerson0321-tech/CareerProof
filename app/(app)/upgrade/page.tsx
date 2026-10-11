import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Check } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PLAN_FEATURES } from "@/lib/billing/plans";
import { billingConfigured } from "@/lib/billing/checkout";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/common/notice";
import { PageSkeleton } from "@/components/common/page-skeleton";
import { UpgradeButton } from "@/components/billing/billing-buttons";

export const metadata: Metadata = { title: "Upgrade to Pro" };

export default function UpgradePage({ searchParams }: PageProps<"/upgrade">) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Upgrade to Pro</h1>
        <p className="mt-1 text-lg text-fg-muted">For when you&apos;re applying to more jobs.</p>
      </div>
      <Suspense fallback={<PageSkeleton label="Loading plans" />}>
        <Upgrade searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Upgrade({ searchParams }: Pick<PageProps<"/upgrade">, "searchParams">) {
  const user = await requireUser("/upgrade");
  const params = await searchParams;
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("plan").eq("user_id", user.id).single();

  if (profile?.plan === "pro") {
    return (
      <Notice tone="success" title="You have Pro">
        Everything is unlocked.{" "}
        <Link href="/settings#plan" className="font-semibold text-primary underline">
          Manage your plan in Settings
        </Link>
        .
      </Notice>
    );
  }

  return (
    <>
      {params.cancelled && <Notice tone="info">Checkout was cancelled. You haven&apos;t been charged.</Notice>}
      <section aria-labelledby="pro-heading" className="rounded-xl border-2 border-primary bg-surface p-5 shadow-card sm:p-6">
        <h2 id="pro-heading" className="text-xl font-bold">
          Pro
        </h2>
        <ul className="mt-3 flex flex-col gap-2">
          {PLAN_FEATURES.pro.map((f) => (
            <li key={f} className="flex gap-2">
              <Check className="mt-0.5 size-5 shrink-0 text-strong" aria-hidden /> {f}
            </li>
          ))}
        </ul>
        <div className="mt-5">
          {billingConfigured() ? (
            <UpgradeButton />
          ) : (
            <Notice tone="info">Upgrades aren&apos;t available on this copy of CareerProof yet. Billing hasn&apos;t been set up.</Notice>
          )}
        </div>
      </section>
      <p className="text-fg-muted">
        Staying on Free is fine too: you keep your vault, your 2 applications and their downloads.{" "}
        <Button asChild variant="quiet" className="min-h-0 px-0">
          <Link href="/applications">Back to applications</Link>
        </Button>
      </p>
    </>
  );
}
