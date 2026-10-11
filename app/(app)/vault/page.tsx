import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FilePlus2 } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { loadVault } from "@/lib/vault/load";
import { currentYearMonth } from "@/lib/dates/parse";
import { createClient } from "@/lib/supabase/server";
import type { ExtractionWarning } from "@/lib/extract/detect";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/common/notice";
import { PageSkeleton } from "@/components/common/page-skeleton";
import { VaultClient } from "./vault-client";

export const metadata: Metadata = { title: "Career Vault" };

export default function VaultPage({ searchParams }: PageProps<"/vault">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading your vault" />}>
      <Vault searchParams={searchParams} />
    </Suspense>
  );
}

async function Vault({ searchParams }: Pick<PageProps<"/vault">, "searchParams">) {
  const user = await requireUser("/vault");
  const params = await searchParams;
  const imported = typeof params.imported === "string" ? params.imported : null;
  const { profile, jobs, facts } = await loadVault(user.id);

  let importNotes: string[] = [];
  if (imported) {
    const supabase = await createClient();
    const { data } = await supabase.from("source_documents").select("extraction_warnings").eq("id", imported).maybeSingle();
    importNotes = ((data?.extraction_warnings ?? []) as unknown as ExtractionWarning[])
      .filter((w) => !w.blocking)
      .map((w) => w.message);
  }
  const added = Number(params.added ?? 0);
  const newJobs = Number(params.jobs ?? 0);
  const known = Number(params.known ?? 0);

  return (
    <div className="flex flex-col gap-6">
      {imported && (
        <Notice tone={added > 0 ? "success" : "info"} title={importTitle(added, newJobs)}>
          {known > 0 && <p>{known} {known === 1 ? "fact was" : "facts were"} already in your vault, so we didn&apos;t add them again.</p>}
          {added > 0 && <p>New items are marked below. Check them over, then confirm.</p>}
          {importNotes.length > 0 && (
            <ul className="mt-2 list-disc pl-5">
              {importNotes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </Notice>
      )}

      {jobs.length === 0 && facts.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-8 text-center shadow-card">
          <h1 className="text-2xl font-bold">Your vault is empty</h1>
          <p className="mt-2 text-fg-muted">Add your resume and we&apos;ll turn it into facts you can check and confirm.</p>
          <Button asChild size="lg" className="mt-5">
            <Link href="/onboarding">Add your resume</Link>
          </Button>
        </div>
      ) : (
        <VaultClient
          profile={profile}
          jobs={jobs}
          facts={facts}
          asOf={currentYearMonth()}
          // "New" badges only help when adding to a vault that already had facts.
          highlightSourceId={imported && facts.some((f) => f.source_document_id !== imported) ? imported : null}
        />
      )}

      {(jobs.length > 0 || facts.length > 0) && (
        <section className="flex flex-col gap-2 rounded-xl border border-dashed border-border-strong p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold">Have another version of your resume?</h2>
            <p className="text-fg-muted">We&apos;ll add only what&apos;s new and never change facts you&apos;ve confirmed.</p>
          </div>
          <Button asChild variant="secondary">
            <Link href="/vault/add-resume">
              <FilePlus2 className="size-5" aria-hidden /> Add another resume
            </Link>
          </Button>
        </section>
      )}
    </div>
  );
}

function importTitle(added: number, jobs: number) {
  if (added === 0 && jobs === 0) return "Nothing new in that resume";
  const parts = [`${added} new ${added === 1 ? "fact" : "facts"}`];
  if (jobs > 0) parts.push(`${jobs} new ${jobs === 1 ? "job" : "jobs"}`);
  return `Added ${parts.join(" and ")} to your vault`;
}
