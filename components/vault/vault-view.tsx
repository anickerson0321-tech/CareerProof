"use client";

import { CircleAlert, CircleCheck, Mail, MapPin, Phone } from "lucide-react";
import type { Fact, FactType, Job } from "@/lib/domain";
import type { YearMonth } from "@/lib/dates/parse";
import { endDateSortKey } from "@/lib/dates/parse";
import { experienceFor, jobMonths } from "@/lib/dates/intervals";
import { formatDateRange, formatMonths } from "@/lib/dates/format";
import { checkYearsClaim } from "@/lib/vault/summary-claims";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface VaultProfile {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  headline: string | null;
}

export interface VaultActions {
  onConfirmAll?: () => void;
  onConfirmFact?: (factId: string) => void;
  onConfirmJob?: (jobId: string) => void;
  busy?: boolean;
}

const SECTIONS: { title: string; types: FactType[]; empty: string }[] = [
  { title: "Skills", types: ["skill"], empty: "No skills yet." },
  { title: "Education", types: ["education"], empty: "No education yet." },
  { title: "Certifications", types: ["certification"], empty: "No certifications or licenses yet." },
  { title: "Training", types: ["training"], empty: "No training yet." },
  { title: "From your answers", types: ["answer"], empty: "Answers you give on applications show up here." },
  { title: "Summary claims", types: ["summary_claim"], empty: "No summary claims." },
  { title: "Other", types: ["other"], empty: "Nothing else." },
];

export function VaultView({
  profile,
  jobs,
  facts,
  asOf,
  readOnly = false,
  actions,
}: {
  profile: VaultProfile;
  jobs: Job[];
  facts: Fact[];
  asOf: YearMonth;
  readOnly?: boolean;
  actions?: VaultActions;
}) {
  const visible = facts.filter((f) => f.status !== "unsupported");
  const sortedJobs = [...jobs].sort((a, b) => endDateSortKey(b.end_date) - endDateSortKey(a.end_date));
  const experience = experienceFor(jobs, asOf);
  const pendingFacts = visible.filter((f) => f.status === "pending");
  const pendingJobs = jobs.filter((j) => j.status === "pending");
  const waiting = pendingFacts.length + pendingJobs.length;
  const confirmed = visible.filter((f) => f.status === "confirmed").length;
  const jobIds = new Set(jobs.map((j) => j.id));
  const underJob = (f: Fact) =>
    f.job_id !== null && jobIds.has(f.job_id) && (f.type === "duty" || f.type === "accomplishment");
  const disabledNote = readOnly ? "Sample data. Sign up to make changes." : undefined;

  return (
    <div className="flex flex-col gap-8">
      <header className="rounded-xl border border-border bg-surface p-5 shadow-card">
        <h1 className="text-2xl font-bold sm:text-3xl">{profile.full_name || "Your Career Vault"}</h1>
        {profile.headline && <p className="mt-1 text-fg-muted">{profile.headline}</p>}
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-fg-muted">
          {profile.location && (
            <li className="inline-flex items-center gap-1.5">
              <MapPin className="size-4" aria-hidden /> {profile.location}
            </li>
          )}
          {profile.phone && (
            <li className="inline-flex items-center gap-1.5">
              <Phone className="size-4" aria-hidden /> {profile.phone}
            </li>
          )}
          {profile.email && (
            <li className="inline-flex items-center gap-1.5">
              <Mail className="size-4" aria-hidden /> {profile.email}
            </li>
          )}
        </ul>
        <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat
            label="Total work history"
            value={`${experience.isMinimum ? "At least " : ""}${formatMonths(experience.months)}`}
            hint="Overlapping jobs counted once"
          />
          <Stat label="Confirmed facts" value={String(confirmed)} />
          <Stat label="Waiting for you" value={String(waiting)} emphasize={waiting > 0} />
        </dl>
      </header>

      {waiting > 0 && (
        <div
          role="status"
          className="flex flex-col gap-3 rounded-xl border border-hidden/40 bg-hidden-tint p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="font-semibold text-fg">
            <CircleAlert className="mr-1.5 inline size-5 align-[-4px] text-hidden" aria-hidden />
            Check these over, then confirm. {waiting} {waiting === 1 ? "item is" : "items are"} waiting.
          </p>
          <Button disabled={readOnly || actions?.busy} title={disabledNote} onClick={actions?.onConfirmAll}>
            Confirm all {waiting}
          </Button>
        </div>
      )}

      <section aria-labelledby="work-heading" className="flex flex-col gap-4">
        <h2 id="work-heading" className="text-xl font-bold">
          Work history
        </h2>
        {sortedJobs.length === 0 && <p className="text-fg-muted">No jobs yet.</p>}
        {sortedJobs.map((job) => {
          const months = jobMonths(job, asOf);
          const jobFacts = visible.filter((f) => f.job_id === job.id && underJob(f));
          return (
            <article key={job.id} className="rounded-xl border border-border bg-surface shadow-card">
              <div className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-sans text-lg font-semibold leading-snug">{job.title || "Untitled role"}</h3>
                  <p className="text-fg-muted">
                    {job.employer}
                    {job.location ? ` · ${job.location}` : ""}
                  </p>
                  <p className="mt-1 text-sm">
                    {formatDateRange(job.start_date, job.end_date)}
                    {months !== null && <span className="text-fg-muted"> · {formatMonths(months)}</span>}
                    {(job.dates_uncertain || months === null) && (
                      <span className="ml-2 rounded bg-partial-tint px-1.5 py-0.5 text-xs font-semibold text-partial">
                        Dates unclear
                      </span>
                    )}
                  </p>
                </div>
                {job.status === "confirmed" ? (
                  <ConfirmedPill />
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={readOnly || actions?.busy}
                    title={disabledNote}
                    onClick={() => actions?.onConfirmJob?.(job.id)}
                  >
                    Confirm job
                  </Button>
                )}
              </div>
              <ul className="divide-y divide-border">
                {jobFacts.map((f) => (
                  <FactRow key={f.id} fact={f} readOnly={readOnly} actions={actions} />
                ))}
                {jobFacts.length === 0 && <li className="p-4 text-sm text-fg-muted">No duties listed yet.</li>}
              </ul>
            </article>
          );
        })}
      </section>

      {SECTIONS.map((section) => {
        const items = visible.filter(
          (f) =>
            section.types.includes(f.type) ||
            (section.title === "Other" && (f.type === "duty" || f.type === "accomplishment") && !underJob(f)),
        );
        if (items.length === 0 && (section.title === "Other" || section.title === "Summary claims")) return null;
        const id = `section-${section.title.toLowerCase().replace(/\s+/g, "-")}`;
        return (
          <section key={section.title} aria-labelledby={id} className="flex flex-col gap-3">
            <h2 id={id} className="text-xl font-bold">
              {section.title}
            </h2>
            <div className="rounded-xl border border-border bg-surface shadow-card">
              {items.length === 0 ? (
                <p className="p-4 text-sm text-fg-muted">{section.empty}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {items.map((f) => (
                    <FactRow
                      key={f.id}
                      fact={f}
                      readOnly={readOnly}
                      actions={actions}
                      claimNote={
                        f.type === "summary_claim"
                          ? checkYearsClaim(f.text, experience.months, experience.isMinimum)?.message ?? null
                          : null
                      }
                      jobLabel={f.type === "answer" ? jobs.find((j) => j.id === f.job_id)?.title ?? null : null}
                    />
                  ))}
                </ul>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Stat({ label, value, hint, emphasize }: { label: string; value: string; hint?: string; emphasize?: boolean }) {
  return (
    <div className={cn("rounded-lg bg-surface-2 p-3", emphasize && "bg-hidden-tint")}>
      <dt className="text-sm font-semibold text-fg-muted">{label}</dt>
      <dd className="font-display text-xl font-bold">{value}</dd>
      {hint && <dd className="text-xs text-fg-muted">{hint}</dd>}
    </div>
  );
}

function ConfirmedPill() {
  return (
    <span className="inline-flex items-center gap-1 self-start rounded-full bg-strong-tint px-2.5 py-1 text-sm font-semibold text-strong">
      <CircleCheck className="size-4" aria-hidden /> Confirmed
    </span>
  );
}

function FactRow({
  fact,
  readOnly,
  actions,
  claimNote = null,
  jobLabel = null,
}: {
  fact: Fact;
  readOnly: boolean;
  actions?: VaultActions;
  claimNote?: string | null;
  jobLabel?: string | null;
}) {
  const origin =
    fact.origin === "resume" && fact.source_passage
      ? `From resume: “${fact.source_passage}”`
      : fact.origin === "answer"
        ? "From your answer"
        : fact.origin === "manual"
          ? "Added by you"
          : null;

  return (
    <li className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:gap-4">
      <span className="w-12 shrink-0 font-mono text-sm font-semibold text-fg-muted">{fact.code}</span>
      <div className="min-w-0 flex-1">
        <p>{fact.text}</p>
        {origin && <p className="mt-1 text-sm text-fg-muted">{origin}</p>}
        {jobLabel && <p className="mt-0.5 text-sm text-fg-muted">At: {jobLabel}</p>}
        {claimNote && (
          <p className="mt-2 rounded-md bg-partial-tint px-2.5 py-1.5 text-sm text-partial">{claimNote}</p>
        )}
      </div>
      <div className="shrink-0">
        {fact.status === "confirmed" ? (
          <ConfirmedPill />
        ) : (
          <Button
            size="sm"
            variant="secondary"
            disabled={readOnly || actions?.busy}
            title={readOnly ? "Sample data. Sign up to make changes." : undefined}
            onClick={() => actions?.onConfirmFact?.(fact.id)}
          >
            Confirm
          </Button>
        )}
      </div>
    </li>
  );
}
