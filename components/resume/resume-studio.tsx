"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RefreshCw, Wand2 } from "lucide-react";
import type { Fact, Job, PageTarget } from "@/lib/domain";
import { PAGE_TARGETS } from "@/lib/domain";
import { PAGE_TARGET_LABELS } from "@/lib/ai/tasks/generate-resume";
import type { ResumeContent } from "@/lib/render/model";
import { applyOp, type DocumentOp } from "@/lib/resume/ops";
import { api, ApiClientError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/common/notice";
import { ProgressState } from "@/components/common/progress-state";
import { ExportBar } from "./export-bar";
import { ResumePreview, guardFacts, type ResumeActions, type ResumeContact } from "./resume-preview";
import { track } from "@/lib/analytics";

export interface StudioDocument {
  id: string;
  version: number;
  page_target: PageTarget;
  content: ResumeContent;
}

export function ResumeStudio({
  applicationId,
  initial,
  contact,
  jobs,
  facts,
}: {
  applicationId: string;
  initial: StudioDocument | null;
  contact: ResumeContact;
  jobs: Job[];
  facts: Fact[];
}) {
  const router = useRouter();
  const [doc, setDoc] = useState<StudioDocument | null>(initial);
  const [pageTarget, setPageTarget] = useState<PageTarget>(initial?.page_target ?? "one_if_possible");
  const [working, setWorking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const groupId = useId();
  const pendingJobs = jobs.filter((j) => j.status === "pending");
  const confirmedCount = facts.filter((f) => f.status === "confirmed").length;

  async function write() {
    setError(null);
    setWorking(true);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const next = await api<StudioDocument>(`/api/applications/${applicationId}/resume`, {
        body: { pageTarget },
        signal: controller.signal,
      });
      setDoc(next);
      track("Resume written");
      router.refresh();
    } catch (e) {
      if (!(e instanceof ApiClientError && e.code === "aborted")) {
        setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      }
    } finally {
      setWorking(false);
    }
  }

  /** Apply instantly in the browser, then save; roll back if the server says no. */
  async function change(op: DocumentOp) {
    if (!doc) return;
    const before = doc;
    setError(null);
    try {
      setDoc({ ...doc, content: applyOp(doc.content, op, guardFacts(facts)) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That change isn't allowed.");
      return;
    }
    setBusy(true);
    try {
      const saved = await api<StudioDocument>(`/api/documents/${doc.id}`, { method: "PATCH", body: op });
      setDoc(saved);
    } catch (e) {
      setDoc(before);
      setError(e instanceof Error ? e.message : "We couldn't save that change. Please try again.");
      throw e;
    } finally {
      setBusy(false);
    }
  }

  const actions: ResumeActions = {
    busy,
    toggleInclude: (bulletId, included) => change({ op: "include", bulletId, included }).catch(() => undefined),
    markReviewed: (bulletId) => change({ op: "review", bulletId }).catch(() => undefined),
    editBullet: (bulletId, text) => change({ op: "edit", bulletId, text }),
    editSummary: (text) => change({ op: "summary-edit", text }),
    reviewSummary: () => change({ op: "summary-review" }).catch(() => undefined),
  };

  if (working) {
    return (
      <ProgressState
        title="Writing your resume…"
        timing="This usually takes 30 to 60 seconds: we write it from your confirmed facts, then fact-check every line."
        stillWorking="Still working. The fact-check pass can take a little longer."
        onCancel={() => abort.current?.abort()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="font-semibold">Page target</legend>
        <div className="flex flex-col gap-1 sm:flex-row sm:gap-5">
          {PAGE_TARGETS.map((value) => (
            <label key={value} className="inline-flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name={`${groupId}-page-target`}
                value={value}
                checked={pageTarget === value}
                disabled={busy}
                onChange={() => {
                  setPageTarget(value);
                  if (doc) void change({ op: "page-target", pageTarget: value }).catch(() => undefined);
                }}
                className="size-5 accent-[var(--primary)]"
              />
              {PAGE_TARGET_LABELS[value]}
            </label>
          ))}
        </div>
      </fieldset>

      {error && <Notice tone="error">{error}</Notice>}

      {pendingJobs.length > 0 && (
        <Notice tone="info" title={`${pendingJobs.length} ${pendingJobs.length === 1 ? "job isn't" : "jobs aren't"} confirmed`}>
          Only confirmed jobs appear on your resume.{" "}
          <Link href="/vault" className="font-semibold text-primary underline">
            Review your vault
          </Link>
        </Notice>
      )}

      {!doc ? (
        <div className="rounded-xl border border-border bg-surface p-6 shadow-card">
          <h2 className="text-xl font-bold">Write a resume for this job</h2>
          <p className="mt-1 text-fg-muted">
            We&apos;ll use only your {confirmedCount} confirmed {confirmedCount === 1 ? "fact" : "facts"}. Every line will show the facts it
            came from, and anything that says more than your facts will be flagged.
          </p>
          <Button size="lg" className="mt-4" onClick={write} disabled={confirmedCount === 0}>
            <Wand2 className="size-5" aria-hidden /> Write my resume
          </Button>
          {confirmedCount === 0 && (
            <p className="mt-2 text-sm text-fg-muted">
              Confirm facts in your{" "}
              <Link href="/vault" className="font-semibold text-primary underline">
                vault
              </Link>{" "}
              first.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-fg-muted">Version {doc.version}. Changes save automatically.</p>
            <Button variant="secondary" onClick={write} disabled={busy}>
              <RefreshCw className="size-4" aria-hidden /> Rewrite
            </Button>
          </div>
          <ResumePreview content={doc.content} contact={contact} jobs={jobs} facts={facts} actions={actions} />
          <ExportBar
            documentId={doc.id}
            revision={`${doc.version}:${doc.page_target}:${JSON.stringify(doc.content)}`}
            busy={busy}
            onRemoveLines={(bulletIds) => change({ op: "exclude-many", bulletIds }).catch(() => undefined)}
          />
        </>
      )}
    </div>
  );
}
