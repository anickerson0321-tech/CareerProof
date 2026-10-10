"use client";

import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RequirementView } from "@/lib/matching/view";
import { FactChips } from "./fact-chips";
import { StatusPill } from "./status-pill";

export interface RequirementActions {
  onConfirmFact?: (factId: string) => void;
  onConfirmJob?: (jobId: string) => void;
  onUndoGap?: (requirementId: string) => void;
  busy?: boolean;
}

export function RequirementCard({
  view,
  actions,
  readOnly = false,
}: {
  view: RequirementView;
  actions?: RequirementActions;
  readOnly?: boolean;
}) {
  const { req, status } = view;
  const disabledNote = readOnly ? "Sample data. Sign up to make changes." : undefined;
  // "Confirm E12" appears only when unconfirmed facts are what's holding this back.
  const confirmable = status === "hidden" ? view.unconfirmedFacts : [];
  const confirmableJobs = status === "hidden" ? view.unconfirmedJobs : [];

  return (
    <article className="rounded-xl border border-border bg-surface p-4 shadow-card sm:p-5" aria-labelledby={`req-${req.id}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <h3 id={`req-${req.id}`} className="font-sans text-base font-semibold leading-snug">
          <span className="sr-only">{req.code}: </span>
          {req.text}
        </h3>
        <StatusPill status={status} className="self-start" />
      </div>

      <p className="mt-2 text-[0.95rem] text-fg-muted">{req.explanation}</p>

      {view.yearsText && (
        <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
          <span className="font-semibold">Dates from your vault: </span>
          {view.yearsText}
        </p>
      )}

      {req.logic === "any" && req.parts.length > 1 && (
        <p className="mt-2 text-sm text-fg-muted">Any one of these counts: {req.parts.join(", ")}.</p>
      )}

      <FactChips facts={view.evidence} />

      {(confirmable.length > 0 || confirmableJobs.length > 0 || status === "gap") && (
        <div className="mt-3 flex flex-wrap gap-2">
          {confirmable.map((f) => (
            <Button
              key={f.id}
              size="sm"
              variant="secondary"
              disabled={readOnly || actions?.busy}
              title={disabledNote}
              onClick={() => actions?.onConfirmFact?.(f.id)}
            >
              Confirm <span className="font-mono">{f.code}</span>
            </Button>
          ))}
          {confirmableJobs.map((j) => (
            <Button
              key={j.id}
              size="sm"
              variant="secondary"
              disabled={readOnly || actions?.busy}
              title={disabledNote}
              onClick={() => actions?.onConfirmJob?.(j.id)}
            >
              Confirm {j.title}
            </Button>
          ))}
          {status === "gap" && (
            <Button
              size="sm"
              variant="ghost"
              disabled={readOnly || actions?.busy}
              title={disabledNote}
              onClick={() => actions?.onUndoGap?.(req.id)}
            >
              <Undo2 className="size-4" aria-hidden /> Undo
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
