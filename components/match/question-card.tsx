"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea, Label } from "@/components/ui/input";
import type { RequirementView } from "@/lib/matching/view";

export function QuestionCard({
  view,
  readOnly = false,
  busy = false,
  onSave,
  onDontHave,
}: {
  view: RequirementView;
  readOnly?: boolean;
  busy?: boolean;
  onSave?: (answer: string) => Promise<void>;
  onDontHave?: () => Promise<void>;
}) {
  const [answer, setAnswer] = useState("");
  const [saving, setSaving] = useState(false);
  const inputId = useId();
  const disabled = readOnly || busy || !onSave;

  return (
    <article className="rounded-xl border border-border bg-surface p-4 shadow-card sm:p-5" aria-label={`Question about ${view.req.text}`}>
      <p className="text-sm font-semibold text-fg-muted">
        About: <span className="text-fg">{view.req.text}</span>
        {view.req.kind === "required" ? " (required)" : " (preferred)"}
      </p>
      <Label htmlFor={inputId} className="mt-2 block text-base font-semibold leading-snug">
        {view.req.question}
      </Label>
      <Textarea
        id={inputId}
        className="mt-3"
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        disabled={readOnly || saving}
        placeholder={readOnly ? "Sample data. Sign up to answer your own questions." : "Type your answer in your own words"}
        maxLength={2000}
      />
      {saving && (
        <p role="status" className="mt-2 text-sm text-fg-muted">
          Saving your answer. This takes a few seconds…
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          disabled={disabled || answer.trim().length < 2}
          onClick={async () => {
            if (!onSave) return;
            setSaving(true);
            try {
              await onSave(answer.trim());
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Saving…" : "Save answer"}
        </Button>
        <Button variant="secondary" disabled={disabled} onClick={() => onDontHave?.()}>
          I don&apos;t have this
        </Button>
      </div>
    </article>
  );
}
