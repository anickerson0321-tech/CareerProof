"use client";

import { useId, useState } from "react";
import { CircleCheck, CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChipFact {
  id: string;
  code: string;
  text: string;
  status: "confirmed" | "pending" | "unsupported";
}

/** Tappable fact codes. Tapping one shows the fact and whether it's confirmed. */
export function FactChips({ facts, label = "Based on" }: { facts: ChipFact[]; label?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const panelId = useId();
  if (facts.length === 0) return null;
  const openFact = facts.find((f) => f.id === open) ?? null;

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm text-fg-muted">{label}</span>
        {facts.map((f) => {
          const confirmed = f.status === "confirmed";
          const expanded = open === f.id;
          return (
            <button
              key={f.id}
              type="button"
              aria-label={`${f.code}, ${confirmed ? "confirmed" : "not confirmed yet"}`}
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={() => setOpen(expanded ? null : f.id)}
              className={cn(
                "inline-flex min-h-8 items-center gap-1 rounded-md border px-2 font-mono text-sm font-semibold",
                confirmed ? "border-border-strong bg-surface-2 text-fg" : "border-dashed border-hidden bg-hidden-tint text-hidden",
                expanded && "ring-2 ring-ring",
              )}
            >
              {f.code}
            </button>
          );
        })}
      </div>
      <div id={panelId} aria-live="polite">
        {openFact && (
          <div className="mt-2 rounded-lg border border-border bg-surface-2 p-3 text-sm">
            <p className="font-mono text-xs font-semibold text-fg-muted">{openFact.code}</p>
            <p className="mt-0.5">{openFact.text}</p>
            <p
              className={cn(
                "mt-1.5 inline-flex items-center gap-1 font-semibold",
                openFact.status === "confirmed" ? "text-strong" : "text-hidden",
              )}
            >
              {openFact.status === "confirmed" ? (
                <>
                  <CircleCheck className="size-4" aria-hidden /> Confirmed by you
                </>
              ) : (
                <>
                  <CircleAlert className="size-4" aria-hidden /> Not confirmed yet
                </>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
