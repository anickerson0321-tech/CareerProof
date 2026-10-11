"use client";

import { useId, useState } from "react";
import { CircleCheck, Pencil, TriangleAlert } from "lucide-react";
import type { Fact, Job } from "@/lib/domain";
import type { ResumeBullet, ResumeContent } from "@/lib/render/model";
import { checkLine, factsMap, type GuardFact, type GuardResult } from "@/lib/guard/truth-guard";
import { formatDateRange } from "@/lib/dates/format";
import { currentYearMonth, endDateSortKey } from "@/lib/dates/parse";
import { summaryExperience } from "@/lib/render/export-model";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label, Textarea } from "@/components/ui/input";
import { FactChips } from "@/components/match/fact-chips";
import { cn } from "@/lib/utils";
import { GuardBadge } from "./guard-badge";

export interface ResumeContact {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
}

/** Live actions; each may throw a friendly Error, shown by the caller. */
export interface ResumeActions {
  toggleInclude: (bulletId: string, included: boolean) => Promise<void>;
  markReviewed: (bulletId: string) => Promise<void>;
  editBullet: (bulletId: string, text: string) => Promise<void>;
  editSummary: (text: string) => Promise<void>;
  reviewSummary: () => Promise<void>;
  busy?: boolean;
}

export function guardFacts(facts: Fact[]): Map<string, GuardFact> {
  return factsMap(facts.map((f) => ({ id: f.id, code: f.code, status: f.status, text: f.text })));
}

/** Lines that are included but can't go into the download yet. */
export function linesNeedingLook(content: ResumeContent, facts: Map<string, GuardFact>): number {
  return content.jobs.flatMap((j) => j.bullets).filter((b) => b.included && !checkLine(b, facts).exportable).length;
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
  const summaryResult = content.summary ? checkLine(content.summary, guard, { experience: summaryExperience(jobs, currentYearMonth()) }) : null;
  const confirmedOf = (type: Fact["type"]) => facts.filter((f) => f.type === type && f.status === "confirmed");
  const education = confirmedOf("education");
  const certifications = confirmedOf("certification");
  const skills = content.skills.filter(
    (s) => s.included && checkLine({ text: s.text, fact_ids: s.fact_ids, reviewed: false, ai_check: null }, guard, { softChecks: false }).exportable,
  );
  const contactLine = [contact.location, contact.phone, contact.email].filter(Boolean).join("  ·  ");
  // Titles, employers and dates come from the vault; only confirmed jobs are printed.
  const printedJobs = jobs.filter((j) => j.status === "confirmed").sort((a, b) => endDateSortKey(b.end_date) - endDateSortKey(a.end_date));
  const editable = !readOnly && !!actions;

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
          <h2 className="font-resume text-[26px] font-bold tracking-normal">{contact.full_name || "Your name"}</h2>
          {contactLine && <p className="mt-1 text-[13px]">{contactLine}</p>}
        </header>

        {content.summary && summaryResult && (
          <PaperSection title="Summary">
            <EditableLine
              text={content.summary.text}
              label="the summary"
              result={summaryResult}
              factIds={content.summary.fact_ids}
              factById={factById}
              editable={editable}
              busy={actions?.busy}
              onSave={actions?.editSummary}
              onReview={actions?.reviewSummary}
              excludedNote="This summary will be left out of your download."
            />
          </PaperSection>
        )}

        <PaperSection title="Experience">
          {printedJobs.map((job) => {
            const section = content.jobs.find((s) => s.job_id === job.id);
            return (
              <div key={job.id} className="mt-3 first:mt-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <h3 className="font-resume text-[14px] font-bold">{job.title}</h3>
                  <span className="text-[13px]">{formatDateRange(job.start_date, job.end_date)}</span>
                </div>
                <p className="text-[13px] italic">
                  {job.employer}
                  {job.location ? `, ${job.location}` : ""}
                </p>
                {section && section.bullets.length > 0 && (
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
                )}
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
      <h2 className="border-b border-paper-fg/70 pb-0.5 font-resume text-[12.5px] font-bold uppercase tracking-[0.08em]">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function LineMeta({
  result,
  factIds,
  factById,
  children,
}: {
  result: GuardResult;
  factIds: string[];
  factById: Map<string, Fact>;
  children?: React.ReactNode;
}) {
  const cited = factIds.map((id) => factById.get(id)).filter((f): f is Fact => !!f);
  return (
    <div className="mt-1 font-sans text-paper-fg">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <GuardBadge badge={result.badge} className="mt-1.5" />
        <FactChips facts={cited} label="Facts:" className="mt-0" />
        {children}
      </div>
      {result.flags.length > 0 && (
        <ul className="mt-1 list-none text-[13px] text-partial">
          {result.flags.map((f, i) => (
            <li key={i}>{f.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A line of text that can be edited in place (saved when you leave the box). */
function EditableLine({
  text,
  label,
  result,
  factIds,
  factById,
  editable,
  busy,
  onSave,
  onReview,
  excludedNote,
}: {
  text: string;
  label: string;
  result: GuardResult;
  factIds: string[];
  factById: Map<string, Fact>;
  editable: boolean;
  busy?: boolean;
  onSave?: (text: string) => Promise<void>;
  onReview?: () => Promise<void>;
  excludedNote?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [saving, setSaving] = useState(false);
  const id = useId();

  async function save() {
    const next = draft.trim();
    if (!onSave || next === text || next.length < 3) {
      setEditing(false);
      setDraft(text);
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
      setEditing(false);
    } catch {
      // The caller shows the error; keep the box open with the person's text.
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={cn(!result.exportable && "rounded-md bg-partial-tint/60 p-1.5 -m-1.5")}>
      {editing ? (
        <div className="font-sans">
          <Label htmlFor={id} className="sr-only">
            Edit {label}
          </Label>
          <Textarea
            id={id}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setDraft(text);
                setEditing(false);
              }
            }}
            autoFocus
            maxLength={800}
            className="min-h-20 bg-white text-[14px]"
          />
          <p className="mt-1 text-xs text-fg-muted">{saving ? "Saving…" : "Saves when you click away. Press Esc to cancel."}</p>
        </div>
      ) : (
        <p>{text}</p>
      )}
      <LineMeta result={result} factIds={factIds} factById={factById}>
        {editable && !editing && (
          <>
            <Button
              size="sm"
              variant="ghost"
              className="min-h-8 px-2"
              disabled={busy}
              onClick={() => {
                // Start from the current text (it changes after a Rewrite or a save).
                setDraft(text);
                setEditing(true);
              }}
              aria-label={`Edit ${label}`}
            >
              <Pencil className="size-4" aria-hidden /> Edit
            </Button>
            {result.badge === "check" && onReview && (
              <Button size="sm" variant="secondary" className="min-h-8" disabled={busy} onClick={() => onReview()} aria-label={`It's accurate: ${label}`}>
                It&apos;s accurate
              </Button>
            )}
          </>
        )}
      </LineMeta>
      {!result.exportable && excludedNote && <p className="mt-1 font-sans text-xs text-fg-muted">{excludedNote}</p>}
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
  const editable = !readOnly && !!actions;
  return (
    <li className="flex gap-2.5" aria-label={`Line: ${bullet.text}`}>
      <Checkbox
        checked={bullet.included}
        disabled={readOnly || actions?.busy}
        title={disabledNote}
        aria-label={`Include this line: ${bullet.text}`}
        onCheckedChange={(v) => actions?.toggleInclude(bullet.id, v === true)}
        className="mt-0.5"
      />
      <div className={cn("min-w-0 flex-1", !bullet.included && "opacity-55")}>
        <div className={cn(!bullet.included && "[&>div>p:first-child]:line-through")}>
          <EditableLine
            text={bullet.text}
            label={`line: ${bullet.text}`}
            result={result}
            factIds={bullet.fact_ids}
            factById={factById}
            editable={editable}
            busy={actions?.busy}
            onSave={actions ? (text) => actions.editBullet(bullet.id, text) : undefined}
            onReview={actions ? () => actions.markReviewed(bullet.id) : undefined}
          />
        </div>
        {readOnly && result.badge === "check" && (
          <p className="mt-1 font-sans text-xs text-fg-muted">
            In your own resume you could edit this line or mark it &ldquo;It&apos;s accurate&rdquo; if it really is.
          </p>
        )}
        {!bullet.included && <p className="mt-1 font-sans text-xs text-fg-muted">Left out of this resume. The fact stays in your vault.</p>}
      </div>
    </li>
  );
}
