import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PLAN_LIMITS } from "@/lib/billing/plans";
import { ResumeIntake } from "@/components/vault/resume-intake";
import { PageSkeleton } from "@/components/common/page-skeleton";

export const metadata: Metadata = { title: "Add another resume" };

export default function AddResumePage() {
  return (
    <div className="flex flex-col gap-6">
      <Link href="/vault" className="inline-flex min-h-11 items-center gap-1 self-start font-semibold text-primary">
        <ArrowLeft className="size-4" aria-hidden /> Back to your vault
      </Link>
      <header>
        <h1 className="text-3xl font-bold">Add another resume</h1>
        <p className="mt-2 max-w-2xl text-fg-muted">
          We&apos;ll compare it with your vault and add only what&apos;s new. Facts you&apos;ve already confirmed stay exactly as they
          are, and facts you removed won&apos;t come back.
        </p>
      </header>
      <Suspense fallback={<PageSkeleton label="Loading" />}>
        <Intake />
      </Suspense>
    </div>
  );
}

async function Intake() {
  const user = await requireUser("/vault/add-resume");
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("plan, imports_used").eq("user_id", user.id).single();
  const blocked = profile && profile.imports_used >= PLAN_LIMITS[profile.plan].imports;
  return (
    <ResumeIntake
      mode="more"
      upgradeMessage={
        blocked
          ? "The free plan includes one resume import. Upgrade to Pro to add more resumes, or add facts to your vault yourself."
          : null
      }
    />
  );
}
