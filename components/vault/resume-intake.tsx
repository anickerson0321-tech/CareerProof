"use client";

import { useId, useRef, useState } from "react";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { useRouter } from "next/navigation";
import { ClipboardPaste, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { ProgressState } from "@/components/common/progress-state";
import { Notice, UpgradePrompt } from "@/components/common/notice";
import { api, ApiClientError } from "@/lib/api/client";
import type { ExtractionWarning } from "@/lib/extract/detect";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";

interface ExtractResponse {
  sourceDocumentId: string | null;
  text: string;
  warnings: ExtractionWarning[];
  blocking: boolean;
}

interface ImportResponse {
  newJobs: number;
  newFacts: number;
  alreadyInVault: number;
  previouslyRemoved: number;
  sourceDocumentId: string;
}

type Stage =
  | { kind: "choose" }
  | { kind: "checking" }
  | { kind: "review"; result: ExtractResponse }
  | { kind: "reading"; result: ExtractResponse };

const ACCEPT = ".docx,.pdf,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

export function ResumeIntake({ mode, upgradeMessage }: { mode: "first" | "more"; upgradeMessage: string | null }) {
  const router = useRouter();
  const [tab, setTab] = useState<"upload" | "paste">("upload");
  const [stage, setStage] = useState<Stage>({ kind: "choose" });
  const [pasted, setPasted] = useState("");
  const [error, setError] = useState<{ message: string; upgrade: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const pasteId = useId();
  const hydrated = useHydrated();

  if (upgradeMessage) return <UpgradePrompt message={upgradeMessage} />;

  async function check(body: { file?: File; text?: string }) {
    setError(null);
    if (body.file && body.file.size > 5 * 1024 * 1024) {
      setError({ message: "That file is over 5 MB. Save a smaller copy (remove images), or paste your resume instead.", upgrade: false });
      return;
    }
    setStage({ kind: "checking" });
    try {
      let result: ExtractResponse;
      if (body.file) {
        const form = new FormData();
        form.set("file", body.file);
        result = await api<ExtractResponse>("/api/resume/extract-text", { form });
      } else {
        result = await api<ExtractResponse>("/api/resume/extract-text", { body: { text: body.text } });
      }
      setStage({ kind: "review", result });
    } catch (e) {
      setStage({ kind: "choose" });
      setError(toError(e));
    }
  }

  async function read(result: ExtractResponse) {
    if (!result.sourceDocumentId) return;
    setError(null);
    setStage({ kind: "reading", result });
    const controller = new AbortController();
    abort.current = controller;
    try {
      const summary = await api<ImportResponse>("/api/vault/import", {
        body: { sourceDocumentId: result.sourceDocumentId },
        signal: controller.signal,
      });
      const params = new URLSearchParams({
        imported: summary.sourceDocumentId,
        added: String(summary.newFacts),
        jobs: String(summary.newJobs),
        known: String(summary.alreadyInVault),
      });
      track("Resume imported");
      router.push(`/vault?${params.toString()}`);
      router.refresh();
    } catch (e) {
      setStage({ kind: "review", result });
      const err = toError(e);
      if (!(e instanceof ApiClientError && e.code === "aborted")) setError(err);
    } finally {
      abort.current = null;
    }
  }

  if (stage.kind === "checking") {
    return <ProgressState title="Checking your file…" timing="This takes a few seconds." />;
  }

  if (stage.kind === "reading") {
    return (
      <ProgressState
        title="Reading your resume…"
        timing="This usually takes 20 to 60 seconds. We're splitting it into facts for you to check."
        stillWorking="Still reading. Longer resumes can take up to a minute."
        onCancel={() => abort.current?.abort()}
      />
    );
  }

  if (stage.kind === "review") {
    const { result } = stage;
    return (
      <div className="flex flex-col gap-5">
        {error && <ErrorNotice error={error} />}
        {result.warnings.map((w) => (
          <Notice key={w.code} tone={w.blocking ? "error" : "warning"} title={w.blocking ? "We can't use this file" : "Please check this"}>
            {w.message}
          </Notice>
        ))}
        <section aria-labelledby="preview-heading">
          <h2 id="preview-heading" className="text-lg font-bold">
            {result.blocking ? "What we could read" : "Here's what we read"}
          </h2>
          <p className="text-sm text-fg-muted">
            {result.blocking
              ? "There wasn't enough readable text to build your vault."
              : "Scroll through to check nothing important is missing or scrambled."}
          </p>
          <pre
            tabIndex={0}
            aria-label="Text read from your resume"
            className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-surface-2 p-4 font-sans text-sm leading-relaxed"
          >
            {result.text || "(No readable text)"}
          </pre>
        </section>
        <div className="flex flex-col gap-2 sm:flex-row">
          {!result.blocking && (
            <Button size="lg" onClick={() => read(result)}>
              Read my resume
            </Button>
          )}
          <Button
            size="lg"
            variant="secondary"
            onClick={() => {
              setStage({ kind: "choose" });
              setError(null);
            }}
          >
            {result.blocking ? "Try another file or paste" : "Use a different file"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-intake-ready={hydrated ? "" : undefined}>
      {error && <ErrorNotice error={error} />}
      <div role="group" aria-label="How to add your resume" className="grid grid-cols-2 gap-2">
        {(
          [
            ["upload", "Upload a file", FileUp],
            ["paste", "Paste text", ClipboardPaste],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              "inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border font-semibold",
              tab === value ? "border-primary bg-strong-tint text-strong" : "border-border bg-surface text-fg-muted hover:text-fg",
            )}
          >
            <Icon className="size-5" aria-hidden /> {label}
          </button>
        ))}
      </div>

      {tab === "upload" ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) void check({ file });
          }}
          className={cn(
            "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed bg-surface p-8 text-center",
            dragging ? "border-primary bg-strong-tint" : "border-border-strong",
          )}
        >
          <FileUp className="size-10 text-primary" aria-hidden />
          <p className="font-semibold">{mode === "first" ? "Choose your resume file" : "Choose another resume"}</p>
          <p className="text-sm text-fg-muted">Word (.docx), PDF, or plain text. Up to 5 MB.</p>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT}
            className="hidden"
            id="resume-file"
            aria-hidden
            tabIndex={-1}
            disabled={!hydrated}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void check({ file });
            }}
          />
          <Button size="lg" disabled={!hydrated} onClick={() => fileInput.current?.click()}>
            Choose file
          </Button>
          <p className="text-xs text-fg-muted">Or drag and drop it here.</p>
        </div>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void check({ text: pasted });
          }}
        >
          <Label htmlFor={pasteId}>Paste your whole resume</Label>
          <Textarea
            id={pasteId}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            className="min-h-72"
            placeholder="Copy everything from your resume (Ctrl+A, then Ctrl+C) and paste it here."
            maxLength={60_000}
          />
          <p className="text-xs text-fg-muted">{pasted.length.toLocaleString("en-US")} / 60,000 characters</p>
          <Button type="submit" size="lg" disabled={!hydrated || pasted.trim().length === 0}>
            Continue
          </Button>
        </form>
      )}
    </div>
  );
}

function toError(e: unknown) {
  if (e instanceof ApiClientError) return { message: e.message, upgrade: e.upgrade };
  return { message: "Something went wrong. Please try again.", upgrade: false };
}

function ErrorNotice({ error }: { error: { message: string; upgrade: boolean } }) {
  if (error.upgrade) return <UpgradePrompt message={error.message} />;
  return <Notice tone="error">{error.message}</Notice>;
}
