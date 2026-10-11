"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import type { AppStatus, Fact, Job, Plan, Requirement } from "@/lib/domain";
import type { YearMonth } from "@/lib/dates/parse";
import { buildRequirementViews } from "@/lib/matching/view";
import { scoreRequirements } from "@/lib/matching/status";
import { api } from "@/lib/api/client";
import { MatchView, type AnswerOutcome, type MatchActions } from "@/components/match/match-view";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusSelect } from "@/components/applications/status-select";
import { ResumeStudio, type StudioDocument } from "@/components/resume/resume-studio";
import type { ResumeContact } from "@/components/resume/resume-preview";
import { CoverLetterStudio, type LetterDocument } from "@/components/letters/cover-letter-studio";

export interface WorkspaceApplication {
  id: string;
  title: string;
  employer: string;
  posting_text: string;
  posting_url: string | null;
  ignored_note: string | null;
  status: AppStatus;
  created_at: string;
}

export function Workspace({
  application,
  requirements,
  facts,
  jobs,
  asOf,
  resume,
  letter,
  plan,
  contact,
}: {
  application: WorkspaceApplication;
  requirements: Requirement[];
  facts: Fact[];
  jobs: Job[];
  asOf: YearMonth;
  resume: StudioDocument | null;
  letter: LetterDocument | null;
  plan: Plan;
  contact: ResumeContact;
}) {
  const router = useRouter();
  const views = useMemo(() => buildRequirementViews(requirements, facts, jobs, asOf), [requirements, facts, jobs, asOf]);
  const score = scoreRequirements(views.map((v) => ({ kind: v.req.kind, status: v.status })));

  const refresh = async <T,>(p: Promise<T>) => {
    const result = await p;
    router.refresh();
    return result;
  };

  const actions: MatchActions = {
    confirmFact: async (id) => {
      await refresh(api(`/api/vault/facts/${id}`, { method: "PATCH", body: { status: "confirmed" } }));
    },
    confirmJob: async (id) => {
      await refresh(api(`/api/vault/jobs/${id}`, { method: "PATCH", body: { status: "confirmed" } }));
    },
    setGap: async (requirementId, gap) => {
      await refresh(api(`/api/applications/${application.id}/gap`, { body: { requirementId, gap } }));
    },
    saveAnswer: (requirementId, answer) =>
      refresh(api<AnswerOutcome>(`/api/applications/${application.id}/answer`, { body: { requirementId, answer } })),
  };

  return (
    <div>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-fg-muted">{application.employer}</p>
          <h1 className="text-2xl font-bold sm:text-3xl">{application.title}</h1>
          <p className="mt-1 text-fg-muted">
            {score.required.supported} of {score.required.total} required met
          </p>
        </div>
        <StatusSelect applicationId={application.id} status={application.status} />
      </header>

      <Tabs defaultValue="match" className="mt-6">
        <TabsList aria-label="Application sections">
          <TabsTrigger value="match">Match</TabsTrigger>
          <TabsTrigger value="resume">Resume</TabsTrigger>
          <TabsTrigger value="letter">Cover letter</TabsTrigger>
          <TabsTrigger value="posting">Posting</TabsTrigger>
        </TabsList>

        <TabsContent value="match">
          <MatchView views={views} ignoredNote={application.ignored_note} actions={actions} />
        </TabsContent>

        <TabsContent value="resume">
          <ResumeStudio applicationId={application.id} initial={resume} contact={contact} jobs={jobs} facts={facts} />
        </TabsContent>

        <TabsContent value="letter">
          <CoverLetterStudio applicationId={application.id} initial={letter} plan={plan} facts={facts} />
        </TabsContent>

        <TabsContent value="posting">
          <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
            {application.posting_url && (
              <p className="mb-4">
                <a
                  href={application.posting_url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-1 font-semibold text-primary underline"
                >
                  Open the original posting <ExternalLink className="size-4" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </p>
            )}
            <p className="whitespace-pre-wrap text-[0.95rem] leading-relaxed">{application.posting_text}</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
