"use client";

import { useId, useState } from "react";
import { CircleAlert, CircleCheck, Mail, MapPin, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import type { Fact, FactType, Job } from "@/lib/domain";
import type { YearMonth } from "@/lib/dates/parse";
import { endDateSortKey } from "@/lib/dates/parse";
import { experienceFor, jobMonths } from "@/lib/dates/intervals";
import { formatDateRange, formatMonths } from "@/lib/dates/format";
import { checkYearsClaim } from "@/lib/vault/summary-claims";
import { FACT_TYPE_HINTS, FACT_TYPE_LABELS, MANUAL_FACT_TYPES } from "@/lib/vault/fact-types";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Notice } from "@/components/common/notice";
import { cn } from "@/lib/utils";

export interface VaultProfile {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  headline: string | null;
}

export interface JobEdit {
  title: string;
  employer: string;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  dates_uncertain: boolean;
}

/** When present, the vault is editable. Each action throws with a friendly message on failure. */
export interface VaultActions {
  confirmAll: () => Promise<void>;
  confirmFact: (factId: string) => Promise<void>;
  confirmJob: (jobId: string) => Promise<void>;
  editFact: (factId: string, text: string) => Promise<void>;
  removeFact: (factId: string) => Promise<void>;
  addFact: (input: { type: FactType; jobId: string | null; text: string }) => Promise<void>;
  editJob: (jobId: string, input: JobEdit) => Promise<void>;
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

const READ_ONLY_NOTE = "Sample data. Sign up to make changes.";

export function VaultView({
  profile,
  jobs,
  facts,
  asOf,
  actions,
  highlightSourceId = null,
  readOnly = !actions,
}: {
  profile: VaultProfile;
  jobs: Job[];
  facts: Fact[];
  asOf: YearMonth;
  actions?: VaultActions;
  /** Facts from this resume are marked "New". */
  highlightSourceId?: string | null;
  readOnly?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

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
  const ctx: RowContext = { readOnly, busy, actions, run, highlightSourceId, jobs };

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
            <li className="inline-flex items-center gap-1.5 break-all">
              <Mail className="size-4 shrink-0" aria-hidden /> {profile.email}
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

      {error && <Notice tone="error">{error}</Notice>}

      {waiting > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-hidden/40 bg-hidden-tint p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-semibold text-fg">
            <CircleAlert className="mr-1.5 inline size-5 align-[-4px] text-hidden" aria-hidden />
            Check these over, then confirm. {waiting} {waiting === 1 ? "item is" : "items are"} waiting.
          </p>
          <Button
            disabled={readOnly || busy}
            title={readOnly ? READ_ONLY_NOTE : undefined}
            onClick={() => actions && run(actions.confirmAll)}
          >
            Confirm all {waiting}
          </Button>
        </div>
      )}

      <section aria-labelledby="work-heading" className="flex flex-col gap-4">
        <h2 id="work-heading" className="text-xl font-bold">
          Work history
        </h2>
        {sortedJobs.length === 0 && <p className="text-fg-muted">No jobs yet.</p>}
        {sortedJobs.map((job) => (
          <JobCard key={job.id} job={job} facts={visible.filter((f) => f.job_id === job.id && underJob(f))} asOf={asOf} ctx={ctx} />
        ))}
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
                      ctx={ctx}
                      claimNote={
                        f.type === "summary_claim"
                          ? (checkYearsClaim(f.text, experience.months, experience.isMinimum)?.message ?? null)
                          : null
                      }
                      jobLabel={f.type === "answer" ? (jobs.find((j) => j.id === f.job_id)?.title ?? null) : null}
                    />
                  ))}
                </ul>
              )}
            </div>
          </section>
        );
      })}

      {!readOnly && actions && <AddFactForm jobs={sortedJobs} ctx={ctx} />}
    </div>
  );
}

interface RowContext {
  readOnly: boolean;
  busy: boolean;
  actions?: VaultActions;
  run: (fn: () => Promise<void>) => Promise<void>;
  highlightSourceId: string | null;
  jobs: Job[];
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

function JobCard({ job, facts, asOf, ctx }: { job: Job; facts: Fact[]; asOf: YearMonth; ctx: RowContext }) {
  const [editing, setEditing] = useState(false);
  const months = jobMonths(job, asOf);
  return (
    <article className="rounded-xl border border-border bg-surface shadow-card" aria-label={`${job.title} at ${job.employer}`}>
      {editing && ctx.actions ? (
        <JobEditForm
          job={job}
          ctx={ctx}
          onDone={() => setEditing(false)}
          onSave={(input) => ctx.actions!.editJob(job.id, input)}
        />
      ) : (
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="font-sans text-lg font-semibold leading-snug">{job.title || "Untitled role"}</h3>
            <p className="text-fg-muted">
              {job.employer}
              {job.location ? ` · ${job.location}` : ""}
            </p>
            <p className="mt-1 text-sm">
              {formatDateRange(job.start_date, job.end_date)}
              {months !== null && <span className="text-fg-muted"> · {formatMonths(months)}</span>}
              {(job.dates_uncertain || months === null) && (
                <span className="ml-2 rounded bg-partial-tint px-1.5 py-0.5 text-xs font-semibold text-partial">Dates unclear</span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {job.status === "confirmed" ? (
              <ConfirmedPill />
            ) : (
              <Button
                size="sm"
                variant="secondary"
                disabled={ctx.readOnly || ctx.busy}
                title={ctx.readOnly ? READ_ONLY_NOTE : undefined}
                onClick={() => ctx.actions && ctx.run(() => ctx.actions!.confirmJob(job.id))}
              >
                Confirm job
              </Button>
            )}
            {!ctx.readOnly && (
              <Button size="sm" variant="ghost" disabled={ctx.busy} onClick={() => setEditing(true)} aria-label={`Edit job details for ${job.title}`}>
                <Pencil className="size-4" aria-hidden /> Edit
              </Button>
            )}
          </div>
        </div>
      )}
      <ul className="divide-y divide-border">
        {facts.map((f) => (
          <FactRow key={f.id} fact={f} ctx={ctx} />
        ))}
        {facts.length === 0 && <li className="p-4 text-sm text-fg-muted">No duties listed yet.</li>}
      </ul>
    </article>
  );
}

function JobEditForm({
  job,
  ctx,
  onSave,
  onDone,
}: {
  job: Job;
  ctx: RowContext;
  onSave: (input: JobEdit) => Promise<void>;
  onDone: () => void;
}) {
  const [form, setForm] = useState<JobEdit>({
    title: job.title,
    employer: job.employer,
    location: job.location,
    start_date: job.start_date,
    end_date: job.end_date,
    dates_uncertain: job.dates_uncertain,
  });
  const id = useId();
  const field = (key: "title" | "employer" | "location" | "start_date" | "end_date", label: string, hint?: string) => (
    <div className="flex flex-col gap-1">
      <Label htmlFor={`${id}-${key}`}>{label}</Label>
      <Input
        id={`${id}-${key}`}
        value={form[key] ?? ""}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        aria-describedby={hint ? `${id}-${key}-hint` : undefined}
      />
      {hint && (
        <p id={`${id}-${key}-hint`} className="text-xs text-fg-muted">
          {hint}
        </p>
      )}
    </div>
  );
  return (
    <form
      className="flex flex-col gap-3 border-b border-border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void ctx.run(async () => {
          await onSave(form);
          onDone();
        });
      }}
    >
      <p className="font-semibold">Edit job details</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {field("title", "Job title")}
        {field("employer", "Employer")}
        {field("location", "Location (optional)")}
        <div />
        {field("start_date", "Started", "Like 2019-06, or just 2019")}
        {field("end_date", "Ended", "Like 2023-02, 2023, or present")}
      </div>
      <label className="inline-flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          className="size-5 accent-[var(--primary)]"
          checked={form.dates_uncertain}
          onChange={(e) => setForm({ ...form, dates_uncertain: e.target.checked })}
        />
        I&apos;m not sure about these dates
      </label>
      <p className="text-sm text-fg-muted">Saving confirms this job.</p>
      <div className="flex gap-2">
        <Button type="submit" disabled={ctx.busy}>
          Save and confirm
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function FactRow({
  fact,
  ctx,
  claimNote = null,
  jobLabel = null,
}: {
  fact: Fact;
  ctx: RowContext;
  claimNote?: string | null;
  jobLabel?: string | null;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "remove">("view");
  const [text, setText] = useState(fact.text);
  const editId = useId();
  const isNew = ctx.highlightSourceId !== null && fact.source_document_id === ctx.highlightSourceId;
  const origin =
    fact.origin === "resume" && fact.source_passage
      ? `From resume: “${fact.source_passage}”`
      : fact.origin === "answer"
        ? "From your answer"
        : fact.origin === "manual"
          ? "Added by you"
          : null;

  return (
    <li
      id={`fact-${fact.code}`}
      className={cn("flex scroll-mt-24 flex-col gap-2 p-4 target:ring-2 target:ring-ring sm:flex-row sm:items-start sm:gap-4", isNew && "bg-strong-tint/40")}
    >
      <span className="w-12 shrink-0 font-mono text-sm font-semibold text-fg-muted">
        {fact.code}
        {isNew && <span className="mt-1 block font-sans text-xs font-bold uppercase text-strong">New</span>}
      </span>
      <div className="min-w-0 flex-1">
        {mode === "edit" ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void ctx.run(async () => {
                await ctx.actions!.editFact(fact.id, text.trim());
                setMode("view");
              });
            }}
          >
            <Label htmlFor={editId} className="sr-only">
              Edit {fact.code}
            </Label>
            <Textarea id={editId} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} autoFocus />
            <p className="text-xs text-fg-muted">Saving confirms this fact. We keep the old wording in your history.</p>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={ctx.busy || text.trim().length < 3}>
                Save and confirm
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setText(fact.text);
                  setMode("view");
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <p>{fact.text}</p>
        )}
        {origin && mode !== "edit" && <p className="mt-1 text-sm text-fg-muted">{origin}</p>}
        {fact.note && mode !== "edit" && <p className="mt-1 text-sm text-partial">Note: {fact.note}</p>}
        {jobLabel && <p className="mt-0.5 text-sm text-fg-muted">At: {jobLabel}</p>}
        {claimNote && <p className="mt-2 rounded-md bg-partial-tint px-2.5 py-1.5 text-sm text-partial">{claimNote}</p>}
        {mode === "remove" && (
          <div className="mt-3 flex flex-col gap-2 rounded-lg border border-danger/40 bg-danger-tint p-3 sm:flex-row sm:items-center" role="group" aria-label={`Remove ${fact.code}?`}>
            <p className="flex-1 text-sm font-semibold text-fg">
              Remove {fact.code} from your vault? It won&apos;t be used in any resume.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="danger"
                disabled={ctx.busy}
                onClick={() => ctx.run(() => ctx.actions!.removeFact(fact.id))}
              >
                Remove
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMode("view")}>
                Keep it
              </Button>
            </div>
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-start gap-2">
        {fact.status === "confirmed" ? (
          <ConfirmedPill />
        ) : (
          <Button
            size="sm"
            variant="secondary"
            disabled={ctx.readOnly || ctx.busy}
            title={ctx.readOnly ? READ_ONLY_NOTE : undefined}
            onClick={() => ctx.actions && ctx.run(() => ctx.actions!.confirmFact(fact.id))}
            aria-label={`Confirm ${fact.code}`}
          >
            Confirm
          </Button>
        )}
        {!ctx.readOnly && mode === "view" && (
          <>
            <Button size="sm" variant="ghost" disabled={ctx.busy} onClick={() => setMode("edit")} aria-label={`Edit ${fact.code}`}>
              <Pencil className="size-4" aria-hidden /> Edit
            </Button>
            <Button size="sm" variant="ghost" disabled={ctx.busy} onClick={() => setMode("remove")} aria-label={`Remove ${fact.code}`}>
              <Trash2 className="size-4" aria-hidden /> Remove
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

function AddFactForm({ jobs, ctx }: { jobs: Job[]; ctx: RowContext }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FactType>("duty");
  const [jobId, setJobId] = useState<string>("");
  const [text, setText] = useState("");
  const id = useId();
  const jobRelevant = type === "duty" || type === "accomplishment" || type === "other";

  if (!open) {
    return (
      <Button variant="secondary" size="lg" className="self-start" onClick={() => setOpen(true)}>
        <Plus className="size-5" aria-hidden /> Add a fact yourself
      </Button>
    );
  }

  return (
    <form
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-card"
      onSubmit={(e) => {
        e.preventDefault();
        void ctx.run(async () => {
          await ctx.actions!.addFact({ type, jobId: jobRelevant && jobId ? jobId : null, text: text.trim() });
          setText("");
          setOpen(false);
        });
      }}
    >
      <h2 className="text-lg font-bold">Add a fact yourself</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-type`}>What kind of fact?</Label>
          <select
            id={`${id}-type`}
            value={type}
            onChange={(e) => setType(e.target.value as FactType)}
            className="min-h-11 rounded-lg border border-border-strong bg-surface px-3"
            aria-describedby={`${id}-hint`}
          >
            {MANUAL_FACT_TYPES.map((t) => (
              <option key={t} value={t}>
                {FACT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <p id={`${id}-hint`} className="text-xs text-fg-muted">
            {FACT_TYPE_HINTS[type] ?? " "}
          </p>
        </div>
        {jobRelevant && (
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${id}-job`}>Which job? (optional)</Label>
            <select
              id={`${id}-job`}
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              className="min-h-11 rounded-lg border border-border-strong bg-surface px-3"
            >
              <option value="">Not tied to a job</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title} · {j.employer}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-text`}>The fact, in one sentence</Label>
        <Textarea
          id={`${id}-text`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          placeholder="Example: Trained 6 new cashiers on the register and opening checklist."
        />
      </div>
      <p className="text-sm text-fg-muted">Facts you add are saved as confirmed.</p>
      <div className="flex gap-2">
        <Button type="submit" disabled={ctx.busy || text.trim().length < 3}>
          Add to my vault
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
