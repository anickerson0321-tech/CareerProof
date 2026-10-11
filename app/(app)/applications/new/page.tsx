import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PLAN_LIMITS } from "@/lib/billing/plans";
import { PageSkeleton } from "@/components/common/page-skeleton";
import { Button } from "@/components/ui/button";
import { UpgradePrompt } from "@/components/common/notice";
import { NewApplicationForm } from "./new-application-form";

export const metadata: Metadata = { title: "New application" };

export default function NewApplicationPage() {
  return (
    <div className="flex flex-col gap-6">
      <Link href="/applications" className="inline-flex min-h-11 items-center gap-1 self-start font-semibold text-primary">
        <ArrowLeft className="size-4" aria-hidden /> Back to applications
      </Link>
      <header>
        <h1 className="text-3xl font-bold">New application</h1>
        <p className="mt-2 max-w-2xl text-fg-muted">
          Paste the full job posting. We&apos;ll show which requirements your confirmed facts support and ask only about what&apos;s
          unclear.
        </p>
      </header>
      <Suspense fallback={<PageSkeleton label="Loading" />}>
        <Gate />
      </Suspense>
    </div>
  );
}

async function Gate() {
  const user = await requireUser("/applications/new");
  const supabase = await createClient();
  const [{ data: profile }, { count }] = await Promise.all([
    supabase.from("profiles").select("plan, applications_created").eq("user_id", user.id).single(),
    supabase.from("facts").select("id", { count: "exact", head: true }).neq("status", "unsupported"),
  ]);
  if ((count ?? 0) === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 shadow-card">
        <h2 className="text-xl font-bold">First, add your resume</h2>
        <p className="mt-1 text-fg-muted">We compare job postings with your Career Vault, and it&apos;s empty right now.</p>
        <Button asChild className="mt-4">
          <Link href="/onboarding">Add your resume</Link>
        </Button>
      </div>
    );
  }
  if (profile && profile.applications_created >= PLAN_LIMITS[profile.plan].applications) {
    return (
      <UpgradePrompt
        message={`The free plan includes ${PLAN_LIMITS.free.applications} applications. Upgrade to Pro for unlimited applications. Your existing applications stay as they are.`}
      />
    );
  }
  return <NewApplicationForm />;
}
