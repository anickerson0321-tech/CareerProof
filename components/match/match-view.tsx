"use client";

import type { RequirementView } from "@/lib/matching/view";
import { selectQuestions } from "@/lib/matching/view";
import { QuestionCard, type QuestionActions } from "./question-card";
import { RequirementCard, type RequirementActions } from "./requirement-card";
import { ScoreCard } from "./score-card";

export function MatchView({
  views,
  ignoredNote,
  readOnly = false,
  requirementActions,
  questionActions,
}: {
  views: RequirementView[];
  ignoredNote: string | null;
  readOnly?: boolean;
  requirementActions?: RequirementActions;
  questionActions?: QuestionActions;
}) {
  const questions = selectQuestions(views);
  const required = views.filter((v) => v.req.kind === "required");
  const preferred = views.filter((v) => v.req.kind === "preferred");

  return (
    <div className="flex flex-col gap-8">
      <ScoreCard
        items={views.map((v) => ({ code: v.req.code, text: v.req.text, kind: v.req.kind, status: v.status }))}
        ignoredNote={ignoredNote}
      />

      {questions.length > 0 && (
        <section aria-labelledby="questions-heading" className="flex flex-col gap-3">
          <div>
            <h2 id="questions-heading" className="text-xl font-bold">
              {questions.length === 1 ? "One question" : `${questions.length} questions`} to fill the gaps
            </h2>
            <p className="text-fg-muted">
              Answers are saved to your vault, so you won&apos;t be asked again on future applications.
            </p>
          </div>
          {questions.map((v) => (
            <QuestionCard key={v.req.id} view={v} readOnly={readOnly} actions={questionActions} />
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
  actions?: RequirementActions;
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
