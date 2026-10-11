import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { listApplications } from "@/lib/applications/list";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/common/notice";
import { PageSkeleton } from "@/components/common/page-skeleton";
import { SegmentBar } from "@/components/match/score-card";
import { StatusSelect } from "@/components/applications/status-select";

export const metadata: Metadata = { title: "Applications" };

export default function ApplicationsPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Applications</h1>
          <p className="mt-1 text-fg-muted">Each job you&apos;re applying for, and how your record matches it.</p>
        </div>
        <Button asChild size="lg">
          <Link href="/applications/new">
            <Plus className="size-5" aria-hidden /> New application
          </Link>
        </Button>
      </header>
      <Suspense fallback={<PageSkeleton label="Loading your applications" />}>
        <ApplicationList />
      </Suspense>
    </div>
  );
}

async function ApplicationList() {
  await requireUser("/applications");
  const supabase = await createClient();
  const [{ applications, waiting }, { count: factCount }] = await Promise.all([
    listApplications(),
    supabase.from("facts").select("id", { count: "exact", head: true }).neq("status", "unsupported"),
  ]);

  return (
    <div className="flex flex-col gap-4">
      {waiting > 0 && (
        <Notice tone="info" title={`${waiting} ${waiting === 1 ? "item in your vault is" : "items in your vault are"} waiting for you`}>
          Unconfirmed facts can&apos;t be used in your resumes yet.{" "}
          <Link href="/vault" className="font-semibold text-primary underline">
            Review your vault
          </Link>
        </Notice>
      )}

      {applications.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-8 text-center shadow-card">
          <h2 className="text-xl font-bold">No applications yet</h2>
          {(factCount ?? 0) === 0 ? (
            <>
              <p className="mt-2 text-fg-muted">Start by adding your resume. Then paste a job posting to see how you match.</p>
              <Button asChild size="lg" className="mt-5">
                <Link href="/onboarding">Add your resume</Link>
              </Button>
            </>
          ) : (
            <>
              <p className="mt-2 text-fg-muted">
                Found a job you want? Paste the posting and we&apos;ll show which requirements your facts support.
              </p>
              <Button asChild size="lg" className="mt-5">
                <Link href="/applications/new">Start your first application</Link>
              </Button>
            </>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {applications.map((app) => (
            <li key={app.id} className="rounded-xl border border-border bg-surface p-4 shadow-card sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2 className="font-sans text-lg font-semibold">
                    <Link href={`/applications/${app.id}`} className="hover:underline">
                      {app.title}
                    </Link>
                  </h2>
                  <p className="text-fg-muted">
                    {app.employer}
                    {app.employer ? " · " : ""}
                    {new Date(app.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                  <p className="mt-1 font-semibold">
                    {app.required.supported} of {app.required.total} required met
                  </p>
                </div>
                <StatusSelect applicationId={app.id} status={app.status} label={`Status for ${app.title}`} compact />
              </div>
              <SegmentBar items={app.segments} className="mt-3 h-2" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
