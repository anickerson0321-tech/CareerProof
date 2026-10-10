"use client";

import { CircleCheck, TriangleAlert } from "lucide-react";
import type { Fact, Job } from "@/lib/domain";
import type { ResumeBullet, ResumeContent } from "@/lib/render/model";
import { checkLine, factsMap, type GuardFact, type GuardResult } from "@/lib/guard/truth-guard";
import { formatDateRange } from "@/lib/dates/format";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FactChips } from "@/components/match/fact-chips";
import { cn } from "@/lib/utils";
import { GuardBadge } from "./guard-badge";

export interface ResumeContact {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
}

export interface ResumeActions {
  onToggleInclude?: (bulletId: string, included: boolean) => void;
  onMarkReviewed?: (bulletId: string) => void;
  onEdit?: (bulletId: string) => void;
  busy?: boolean;
}

export function guardFacts(facts: Fact[]): Map<string, GuardFact> {
  return factsMap(facts.map((f) => ({ id: f.id, code: f.code, status: f.status, text: f.text })));
}

/** Lines that are included but can't go into the download yet. */
export function linesNeedingLook(content: ResumeContent, facts: Map<string, GuardFact>): number {
  return content.jobs
    .flatMap((j) => j.bullets)
    .filter((b) => b.included && !checkLine(b, facts).exportable).length;
}

export function ResumePreview({
  content,
  contact,
  jobs,
  facts,
  readOnly = false,
  actions,
}: {
  content: ResumeContent;
  contact: ResumeContact;
  jobs: Job[];
  facts: Fact[];
  readOnly?: boolean;
  actions?: ResumeActions;
}) {
  const guard = guardFacts(facts);
  const factById = new Map(facts.map((f) => [f.id, f]));
  const needLook = linesNeedingLook(content, guard);
  const summaryResult = content.summary ? checkLine(content.summary, guard) : null;
  const confirmedOf = (type: Fact["type"]) => facts.filter((f) => f.type === type && f.status === "confirmed");
  const education = confirmedOf("education");
  const certifications = confirmedOf("certification");
  const skills = content.skills.filter(
    (s) => s.included && checkLine({ text: s.text, fact_ids: s.fact_ids, reviewed: false, ai_check: null }, guard, { softChecks: false }).exportable,
  );
  const contactLine = [contact.location, contact.phone, contact.email].filter(Boolean).join("  ·  ");

  return (
    <div className="flex flex-col gap-4">
      <div
        role="status"
        className={cn(
          "flex items-start gap-2 rounded-xl border p-4 font-semibold",
          needLook === 0 ? "border-strong/30 bg-strong-tint text-strong" : "border-partial/30 bg-partial-tint text-partial",
        )}
      >
        {needLook === 0 ? (
          <>
            <CircleCheck className="mt-0.5 size-5 shrink-0" aria-hidden /> Every included line is backed by a confirmed fact.
          </>
        ) : (
          <>
            <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
            {needLook} {needLook === 1 ? "line needs" : "lines need"} a look. They stay out of your download until you edit
            them or confirm they&apos;re accurate.
          </>
        )}
      </div>

      <article
        aria-label="Resume preview"
        className="theme-light mx-auto w-full max-w-[8.5in] rounded-sm bg-paper px-5 py-6 font-resume text-[14px] leading-snug text-paper-fg shadow-card sm:px-12 sm:py-10"
      >
        <header className="text-center">
          <h2 className="font-resume text-[26px] font-bold tracking-normal">{contact.full_name}</h2>
          {contactLine && <p className="mt-1 text-[13px]">{contactLine}</p>}
        </header>

        {content.summary && summaryResult && (
          <PaperSection title="Summary">
            <div className={cn(!summaryResult.exportable && "opacity-60")}>
              <p>{content.summary.text}</p>
              <LineMeta result={summaryResult} factIds={content.summary.fact_ids} factById={factById} />
              {!summaryResult.exportable && (
                <p className="mt-1 font-sans text-xs text-fg-muted">This summary will be left out of your download.</p>
              )}
            </div>
          </PaperSection>
        )}

        <PaperSection title="Experience">
          {content.jobs.map((section) => {
            const job = jobs.find((j) => j.id === section.job_id);
            if (!job) return null;
            return (
              <div key={section.job_id} className="mt-3 first:mt-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <h3 className="font-resume text-[14px] font-bold">{job.title}</h3>
                  <span className="text-[13px]">{formatDateRange(job.start_date, job.end_date)}</span>
                </div>
                <p className="text-[13px] italic">
                  {job.employer}
                  {job.location ? `, ${job.location}` : ""}
                </p>
                <ul className="mt-1.5 flex flex-col gap-2">
                  {section.bullets.map((b) => (
                    <BulletRow
                      key={b.id}
                      bullet={b}
                      result={checkLine(b, guard)}
                      factById={factById}
                      readOnly={readOnly}
                      actions={actions}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
        </PaperSection>

        {skills.length > 0 && (
          <PaperSection title="Skills">
            <p>{skills.map((s) => s.text).join(" • ")}</p>
          </PaperSection>
        )}

        {education.length > 0 && (
          <PaperSection title="Education">
            <ul className="flex flex-col gap-1">
              {education.map((f) => (
                <li key={f.id}>{f.text}</li>
              ))}
            </ul>
          </PaperSection>
        )}

        {certifications.length > 0 && (
          <PaperSection title="Certifications">
            <ul className="flex flex-col gap-1">
              {certifications.map((f) => (
                <li key={f.id}>{f.text}</li>
              ))}
            </ul>
          </PaperSection>
        )}
      </article>
    </div>
  );
}

function PaperSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="border-b border-paper-fg/70 pb-0.5 font-resume text-[12.5px] font-bold uppercase tracking-[0.08em]">
        {title}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function LineMeta({
  result,
  factIds,
  factById,
}: {
  result: GuardResult;
  factIds: string[];
  factById: Map<string, Fact>;
}) {
  const cited = factIds.map((id) => factById.get(id)).filter((f): f is Fact => !!f);
  return (
    <div className="mt-1 font-sans text-paper-fg">
      <div className="flex flex-wrap items-center gap-2">
        <GuardBadge badge={result.badge} />
      </div>
      {result.flags.length > 0 && (
        <ul className="mt-1 list-none text-[13px] text-partial">
          {result.flags.map((f, i) => (
            <li key={i}>{f.message}</li>
          ))}
        </ul>
      )}
      <FactChips facts={cited} label="Facts:" />
    </div>
  );
}

function BulletRow({
  bullet,
  result,
  factById,
  readOnly,
  actions,
}: {
  bullet: ResumeBullet;
  result: GuardResult;
  factById: Map<string, Fact>;
  readOnly: boolean;
  actions?: ResumeActions;
}) {
  const disabledNote = readOnly ? "Sample data. Sign up to make changes." : undefined;
  const showAccurate = result.badge === "check";
  return (
    <li className={cn("flex gap-2.5 rounded-md p-1.5 -mx-1.5", !result.exportable && bullet.included && "bg-partial-tint/60")}>
      <Checkbox
        checked={bullet.included}
        disabled={readOnly || actions?.busy}
        title={disabledNote}
        aria-label={`Include this line: ${bullet.text}`}
        onCheckedChange={(v) => actions?.onToggleInclude?.(bullet.id, v === true)}
        className="mt-0.5"
      />
      <div className={cn("min-w-0 flex-1", !bullet.included && "opacity-55")}>
        <p className={cn(!bullet.included && "line-through")}>
          <span aria-hidden>• </span>
          {bullet.text}
        </p>
        <LineMeta result={result} factIds={bullet.fact_ids} factById={factById} />
        {!readOnly && (
          <div className="mt-1.5 flex flex-wrap gap-2 font-sans">
            <Button size="sm" variant="secondary" disabled={actions?.busy} onClick={() => actions?.onEdit?.(bullet.id)}>
              Edit
            </Button>
            {showAccurate && (
              <Button size="sm" variant="secondary" disabled={actions?.busy} onClick={() => actions?.onMarkReviewed?.(bullet.id)}>
                It&apos;s accurate
              </Button>
            )}
          </div>
        )}
        {readOnly && showAccurate && (
          <p className="mt-1 font-sans text-xs text-fg-muted">
            In your own resume you could edit this line or mark it &ldquo;It&apos;s accurate&rdquo; if it really is.
          </p>
        )}
      </div>
    </li>
  );
}
