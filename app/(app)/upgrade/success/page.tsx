import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { confirmCheckout } from "@/lib/billing/checkout";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/common/notice";
import { PageSkeleton } from "@/components/common/page-skeleton";

export const metadata: Metadata = { title: "Welcome to Pro" };

export default function UpgradeSuccessPage({ searchParams }: PageProps<"/upgrade/success">) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <Suspense fallback={<PageSkeleton label="Confirming your upgrade" />}>
        <Confirm searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Confirm({ searchParams }: Pick<PageProps<"/upgrade/success">, "searchParams">) {
  const user = await requireUser("/upgrade");
  const { session_id } = await searchParams;
  if (typeof session_id === "string") {
    // Pro starts now, without waiting for the webhook.
    await confirmCheckout(user.id, session_id).catch(() => false);
  }
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("plan").eq("user_id", user.id).single();

  if (profile?.plan !== "pro") {
    return (
      <>
        <h1 className="text-2xl font-bold sm:text-3xl">Almost there</h1>
        <Notice tone="info">
          We&apos;re waiting for Stripe to confirm your payment. This usually takes a few seconds. Refresh this page, or check Settings
          in a minute.
        </Notice>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-bold sm:text-3xl">You have Pro</h1>
      <Notice tone="success">Unlimited applications, more resumes in your vault, and cover letters are unlocked.</Notice>
      <Button asChild size="lg" className="self-start">
        <Link href="/applications">Go to your applications</Link>
      </Button>
    </>
  );
}
