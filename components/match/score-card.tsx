import type { DerivedStatus, ReqKind } from "@/lib/domain";
import { scoreRequirements, STATUS_LABELS, STATUS_ORDER } from "@/lib/matching/status";
import { cn } from "@/lib/utils";
import { STATUS_STYLES } from "./status-pill";

export interface ScoreItem {
  code: string;
  text: string;
  kind: ReqKind;
  status: DerivedStatus;
}

export function ScoreCard({ items, ignoredNote }: { items: ScoreItem[]; ignoredNote?: string | null }) {
  const score = scoreRequirements(items);
  const present = STATUS_ORDER.filter((s) => items.some((i) => i.status === s));

  return (
    <section aria-labelledby="score-heading" className="rounded-xl border border-border bg-surface p-5 shadow-card">
      <h2 id="score-heading" className="sr-only">
        How your record matches
      </h2>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <p>
          <span className="block font-display text-4xl font-bold leading-none">
            {score.required.supported} <span className="text-fg-muted">/ {score.required.total}</span>
          </span>
          <span className="text-sm font-semibold text-fg-muted">required qualifications supported</span>
        </p>
        {score.preferred.total > 0 && (
          <p>
            <span className="block font-display text-2xl font-bold leading-none">
              {score.preferred.supported} <span className="text-fg-muted">/ {score.preferred.total}</span>
            </span>
            <span className="text-sm font-semibold text-fg-muted">preferred</span>
          </p>
        )}
      </div>

      <SegmentBar items={items} className="mt-5" />

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-fg-muted" aria-label="Legend">
        {present.map((status) => (
          <li key={status} className="inline-flex items-center gap-1.5">
            <span className={cn("inline-block size-3 rounded-sm", STATUS_STYLES[status].solid)} aria-hidden />
            {STATUS_LABELS[status]} ({items.filter((i) => i.status === status).length})
          </li>
        ))}
      </ul>

      {ignoredNote && (
        <p className="mt-4 border-t border-border pt-3 text-sm text-fg-muted">
          <span className="font-semibold text-fg">Left out of matching:</span> {ignoredNote}
        </p>
      )}
    </section>
  );
}

/** One segment per requirement, required first, colored by status. */
export function SegmentBar({ items, className }: { items: ScoreItem[]; className?: string }) {
  const ordered = [...items].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "required" ? -1 : 1));
  const summary = ordered.map((i) => `${i.code}: ${STATUS_LABELS[i.status]}`).join("; ");
  return (
    <div className={cn("flex h-3 w-full gap-0.5", className)} role="img" aria-label={`Requirements by status. ${summary}`}>
      {ordered.map((item) => (
        <span
          key={item.code}
          title={`${item.code} · ${item.text} · ${STATUS_LABELS[item.status]}`}
          className={cn(
            "h-full flex-1 first:rounded-l-full last:rounded-r-full",
            STATUS_STYLES[item.status].solid,
            item.kind === "preferred" && "opacity-70",
          )}
        />
      ))}
    </div>
  );
}
