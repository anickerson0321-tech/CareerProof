"use client";

import { useState } from "react";
import Link from "next/link";
import { CircleCheck } from "lucide-react";
import type { RequirementView } from "@/lib/matching/view";
import { selectQuestions } from "@/lib/matching/view";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/common/notice";
import { QuestionCard } from "./question-card";
import { RequirementCard } from "./requirement-card";
import { ScoreCard } from "./score-card";

export interface AnswerOutcome {
  kind: "fact" | "gap";
  fact?: { id: string; code: string; text: string };
  usedOwnWords?: boolean;
}

/** Live actions for a signed-in person's application. Each throws a friendly Error on failure. */
export interface MatchActions {
  confirmFact: (factId: string) => Promise<void>;
  confirmJob: (jobId: string) => Promise<void>;
  setGap: (requirementId: string, gap: boolean) => Promise<void>;
  saveAnswer: (requirementId: string, answer: string) => Promise<AnswerOutcome>;
}

export function MatchView({
  views,
  ignoredNote,
  readOnly = false,
  actions,
}: {
  views: RequirementView[];
  ignoredNote: string | null;
  readOnly?: boolean;
  actions?: MatchActions;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const questions = selectQuestions(views);
  // Answers saved to the vault but not yet confirmed: the person checks the wording.
  const awaitingOk = views.flatMap((v) =>
    v.req.answered ? v.evidence.filter((f) => f.origin === "answer" && f.status === "pending").map((fact) => ({ view: v, fact })) : [],
  );
  const required = views.filter((v) => v.req.kind === "required");
  const preferred = views.filter((v) => v.req.kind === "preferred");

  const requirementActions = actions && {
    busy,
    onConfirmFact: (id: string) => run(() => actions.confirmFact(id)),
    onConfirmJob: (id: string) => run(() => actions.confirmJob(id)),
    onUndoGap: (id: string) => run(() => actions.setGap(id, false)),
  };

  return (
    <div className="flex flex-col gap-8">
      <ScoreCard
        items={views.map((v) => ({ code: v.req.code, text: v.req.text, kind: v.req.kind, status: v.status }))}
        ignoredNote={ignoredNote}
      />

      {error && <Notice tone="error">{error}</Notice>}
      {note && (
        <Notice tone="success">
          <span>{note}</span>
        </Notice>
      )}

      {(questions.length > 0 || awaitingOk.length > 0) && (
        <section aria-labelledby="questions-heading" className="flex flex-col gap-3">
          <div>
            <h2 id="questions-heading" className="text-xl font-bold">
              {questions.length === 0
                ? "Check your answers"
                : `${questions.length === 1 ? "One question" : `${questions.length} questions`} to fill the gaps`}
            </h2>
            <p className="text-fg-muted">Answers are saved to your vault, so you won&apos;t be asked again on future applications.</p>
          </div>

          {awaitingOk.map(({ view, fact }) => (
            <article key={fact.id} className="rounded-xl border border-hidden/40 bg-hidden-tint p-4 sm:p-5" aria-label={`Your answer about ${view.req.text}`}>
              <p className="flex items-center gap-2 font-semibold">
                <CircleCheck className="size-5 text-strong" aria-hidden />
                Added to your vault as <span className="font-mono">{fact.code}</span>
              </p>
              <p className="mt-2 rounded-lg bg-surface p-3">{fact.text}</p>
              <p className="mt-2 text-sm text-fg-muted">
                Check the wording. It counts toward &ldquo;{view.req.text}&rdquo; once you say it looks right.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={readOnly || busy || !actions}
                  onClick={() => actions && run(() => actions.confirmFact(fact.id))}
                >
                  Looks right
                </Button>
                <Button asChild size="sm" variant="secondary">
                  <Link href={`/vault#fact-${fact.code}`}>Edit in vault</Link>
                </Button>
              </div>
            </article>
          ))}

          {questions.map((v) => (
            <QuestionCard
              key={v.req.id}
              view={v}
              readOnly={readOnly}
              busy={busy}
              onSave={
                actions &&
                ((answer) =>
                  run(async () => {
                    setNote(null);
                    const outcome = await actions.saveAnswer(v.req.id, answer);
                    if (outcome.kind === "gap") {
                      setNote(`Got it. "${v.req.text}" is marked as something you don't have. You can undo that below.`);
                    }
                  }))
              }
              onDontHave={actions && (() => run(() => actions.setGap(v.req.id, true)))}
            />
          ))}
        </section>
      )}

      <RequirementGroup title="Required" views={required} readOnly={readOnly} actions={requirementActions} />
      <RequirementGroup title="Preferred" views={preferred} readOnly={readOnly} actions={requirementActions} />
    </div>
  );
}

function RequirementGroup({
  title,
  views,
  readOnly,
  actions,
}: {
  title: string;
  views: RequirementView[];
  readOnly: boolean;
  actions?: React.ComponentProps<typeof RequirementCard>["actions"];
}) {
  if (views.length === 0) return null;
  const id = `group-${title.toLowerCase()}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-xl font-bold">
        {title} <span className="font-sans text-base font-semibold text-fg-muted">({views.length})</span>
      </h2>
      {views.map((v) => (
        <RequirementCard key={v.req.id} view={v} readOnly={readOnly} actions={actions} />
      ))}
    </section>
  );
}
