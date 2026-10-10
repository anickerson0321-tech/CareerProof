"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea, Label } from "@/components/ui/input";
import type { RequirementView } from "@/lib/matching/view";

export interface QuestionActions {
  onSave?: (requirementId: string, answer: string) => void;
  onDontHave?: (requirementId: string) => void;
  busy?: boolean;
}

export function QuestionCard({
  view,
  actions,
  readOnly = false,
}: {
  view: RequirementView;
  actions?: QuestionActions;
  readOnly?: boolean;
}) {
  const [answer, setAnswer] = useState("");
  const inputId = useId();
  const disabled = readOnly || actions?.busy;

  return (
    <article className="rounded-xl border border-border bg-surface p-4 shadow-card sm:p-5">
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
        disabled={readOnly}
        placeholder={readOnly ? "Sample data. Sign up to answer your own questions." : "Type your answer in your own words"}
        maxLength={2000}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          disabled={disabled || answer.trim().length === 0}
          onClick={() => actions?.onSave?.(view.req.id, answer.trim())}
        >
          Save answer
        </Button>
        <Button variant="secondary" disabled={disabled} onClick={() => actions?.onDontHave?.(view.req.id)}>
          I don&apos;t have this
        </Button>
      </div>
    </article>
  );
}
