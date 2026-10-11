import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { loadApplication } from "@/lib/applications/service";
import { currentYearMonth } from "@/lib/dates/parse";
import { PageSkeleton } from "@/components/common/page-skeleton";
import { Workspace } from "./workspace";

export const metadata: Metadata = { title: "Application" };

export default function ApplicationPage({ params }: PageProps<"/applications/[id]">) {
  return (
    <div className="flex flex-col gap-4">
      <Link href="/applications" className="inline-flex min-h-11 items-center gap-1 self-start font-semibold text-primary">
        <ArrowLeft className="size-4" aria-hidden /> All applications
      </Link>
      <Suspense fallback={<PageSkeleton label="Loading your application" />}>
        <ApplicationData params={params} />
      </Suspense>
    </div>
  );
}

async function ApplicationData({ params }: Pick<PageProps<"/applications/[id]">, "params">) {
  const { id } = await params;
  await requireUser(`/applications/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await loadApplication(id);
  if (!data) notFound();
  return (
    <Workspace
      application={data.application}
      requirements={data.requirements}
      facts={data.facts}
      jobs={data.jobs}
      asOf={currentYearMonth()}
    />
  );
}
