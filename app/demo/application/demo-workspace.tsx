"use client";

import { useMemo } from "react";
import { MatchView } from "@/components/match/match-view";
import { ResumePreview } from "@/components/resume/resume-preview";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DEMO_AS_OF,
  demoApplication,
  demoCoverLetter,
  demoFacts,
  demoJobs,
  demoProfile,
  demoRequirements,
  demoResume,
} from "@/lib/demo/data";
import { buildRequirementViews } from "@/lib/matching/view";
import { scoreRequirements } from "@/lib/matching/status";

export function DemoWorkspace() {
  const views = useMemo(() => buildRequirementViews(demoRequirements, demoFacts, demoJobs, DEMO_AS_OF), []);
  const score = scoreRequirements(views.map((v) => ({ kind: v.req.kind, status: v.status })));
  const words = demoCoverLetter.trim().split(/\s+/).length;

  return (
    <div>
      <header>
        <p className="text-sm font-semibold text-fg-muted">{demoApplication.employer}</p>
        <h1 className="text-2xl font-bold sm:text-3xl">{demoApplication.title}</h1>
        <p className="mt-1 text-fg-muted">
          {score.required.supported} of {score.required.total} required met · Draft
        </p>
      </header>

      <Tabs defaultValue="match" className="mt-6">
        <TabsList aria-label="Application sections">
          <TabsTrigger value="match">Match</TabsTrigger>
          <TabsTrigger value="resume">Resume</TabsTrigger>
          <TabsTrigger value="letter">Cover letter</TabsTrigger>
          <TabsTrigger value="posting">Posting</TabsTrigger>
        </TabsList>

        <TabsContent value="match">
          <MatchView views={views} ignoredNote={demoApplication.ignored_note} readOnly />
        </TabsContent>

        <TabsContent value="resume">
          <fieldset className="mb-5" disabled>
            <legend className="font-semibold">Page target</legend>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:gap-5">
              {[
                ["strict_one", "Strictly one page"],
                ["one_if_possible", "One page if possible"],
                ["up_to_two", "Up to two pages"],
              ].map(([value, label]) => (
                <label key={value} className="inline-flex min-h-11 items-center gap-2 opacity-80">
                  <input type="radio" name="page-target" value={value} defaultChecked={value === "one_if_possible"} className="size-5 accent-[var(--primary)]" />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <ResumePreview content={demoResume} contact={demoProfile} jobs={demoJobs} facts={demoFacts} readOnly />
          <p className="mt-4 text-sm text-fg-muted">
            In your own account, Word and PDF downloads appear here. Lines that need a look are left out of the download
            until you fix them.
          </p>
        </TabsContent>

        <TabsContent value="letter">
          <div className="theme-light mx-auto max-w-[8.5in] rounded-sm bg-paper px-5 py-6 font-resume text-[15px] leading-relaxed text-paper-fg shadow-card sm:px-12 sm:py-10">
            {demoCoverLetter.split("\n\n").map((para, i) => (
              <p key={i} className="mt-4 whitespace-pre-line first:mt-0">
                {para}
              </p>
            ))}
          </div>
          <p className="mt-3 text-sm text-fg-muted">
            {words} words. Written only from confirmed facts behind the strongest matches.
          </p>
        </TabsContent>

        <TabsContent value="posting">
          <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
            <p className="whitespace-pre-wrap text-[0.95rem] leading-relaxed">{demoApplication.posting_text}</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
