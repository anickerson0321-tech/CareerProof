"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Progress for AI work: what's happening, realistic timing, elapsed time,
 * and a Cancel button. Screen readers hear the status as it changes.
 */
export function ProgressState({
  title,
  timing,
  stillWorking,
  onCancel,
}: {
  title: string;
  timing: string;
  /** Shown after ~30 seconds so a long wait doesn't feel stuck. */
  stillWorking?: string;
  onCancel?: () => void;
}) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const late = seconds >= 30 && stillWorking;
  return (
    <div className="rounded-xl border border-border bg-surface p-6 shadow-card">
      <div className="flex items-start gap-4">
        <span className="mt-1 inline-block size-6 shrink-0 animate-spin rounded-full border-[3px] border-primary/25 border-t-primary motion-reduce:animate-none" aria-hidden />
        <div className="min-w-0 flex-1">
          <p role="status" aria-live="polite" className="text-lg font-semibold">
            {late ? stillWorking : title}
          </p>
          <p className="mt-1 text-fg-muted">{timing}</p>
          <p className="mt-1 text-sm text-fg-muted" aria-hidden>
            {seconds}s
          </p>
        </div>
      </div>
      {onCancel && (
        <Button variant="secondary" className="mt-5" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </div>
  );
}
