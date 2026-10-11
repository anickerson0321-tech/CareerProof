"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Copy, Download, FileText, RefreshCw, Wand2 } from "lucide-react";
import type { Fact, Plan } from "@/lib/domain";
import { api, ApiClientError } from "@/lib/api/client";
import { downloadFile } from "@/lib/api/download";
import { letterNumberNotes, STREAM_ERROR_MARK, wordCount } from "@/lib/letters/text";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { Notice, UpgradePrompt } from "@/components/common/notice";

export interface LetterDocument {
  id: string;
  version: number;
  text: string;
}

type SaveState = "saved" | "saving" | "unsaved" | "error";

export function CoverLetterStudio({
  applicationId,
  initial,
  plan,
  facts,
}: {
  applicationId: string;
  initial: LetterDocument | null;
  plan: Plan;
  facts: Fact[];
}) {
  const [doc, setDoc] = useState<LetterDocument | null>(initial);
  const [text, setText] = useState(initial?.text ?? "");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>("saved");
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState<"docx" | "pdf" | null>(null);
  const abort = useRef<AbortController | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // What's in the editor now and what the server last confirmed, so a slow
  // save can't mark newer typing as saved.
  const latestText = useRef(initial?.text ?? "");
  const savedText = useRef(initial?.text ?? "");
  const fieldId = useId();
  const confirmedCount = facts.filter((f) => f.status === "confirmed").length;

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  if (plan !== "pro") {
    return (
      <div className="flex flex-col gap-4">
        <UpgradePrompt message="Cover letters are part of Pro. We write a short letter for this job from your confirmed facts, and you can edit it and download it as Word or PDF." />
      </div>
    );
  }

  /** Put the last saved letter back after a failed or cancelled rewrite. */
  function restoreSaved() {
    setText(savedText.current);
    latestText.current = savedText.current;
  }

  async function write() {
    setError(null);
    setUpgrade(null);
    setStreaming(true);
    setText("");
    const controller = new AbortController();
    abort.current = controller;
    let received = "";
    try {
      const response = await fetch(`/api/applications/${applicationId}/cover-letter`, { method: "POST", signal: controller.signal });
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => null)) as { error?: { message: string; upgrade?: boolean } } | null;
        if (data?.error?.upgrade) setUpgrade(data.error.message);
        else setError(data?.error?.message ?? "We couldn't write your letter. Please try again.");
        restoreSaved();
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += decoder.decode(value, { stream: true });
        const mark = received.indexOf(STREAM_ERROR_MARK);
        if (mark >= 0) {
          setError(received.slice(mark + STREAM_ERROR_MARK.length) || "The letter stopped partway. Please try again.");
          restoreSaved();
          return;
        }
        setText(received);
      }
      const saved = await api<LetterDocument>(`/api/applications/${applicationId}/cover-letter`);
      setDoc(saved);
      setText(saved.text);
      latestText.current = saved.text;
      savedText.current = saved.text;
      setSave("saved");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        restoreSaved();
      } else if (!(e instanceof ApiClientError && e.code === "aborted")) {
        setError(e instanceof Error && !(e instanceof TypeError) ? e.message : "We couldn't reach CareerProof. Check your connection and try again.");
        restoreSaved();
      }
    } finally {
      setStreaming(false);
    }
  }

  function onEdit(value: string) {
    setText(value);
    latestText.current = value;
    setSave("unsaved");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void persist(value), 800);
  }

  async function persist(value: string) {
    if (!doc) return;
    setSave("saving");
    try {
      const saved = await api<LetterDocument>(`/api/documents/${doc.id}`, { method: "PATCH", body: { op: "letter-edit", text: value } });
      savedText.current = value;
      setDoc(saved);
      // Only "saved" if nothing was typed while this save was in flight.
      setSave(latestText.current === value ? "saved" : "unsaved");
    } catch {
      setSave("error");
    }
  }

  async function flush() {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (latestText.current !== savedText.current) await persist(latestText.current);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Your browser didn't allow copying. Select the text and copy it instead.");
    }
  }

  async function download(format: "docx" | "pdf") {
    if (!doc) return;
    setError(null);
    setDownloading(format);
    try {
      await flush();
      await downloadFile(`/api/documents/${doc.id}/export?format=${format}`, `Cover Letter.${format}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The download didn't work. Please try again.");
    } finally {
      setDownloading(null);
    }
  }

  const words = wordCount(text);
  const notes = streaming ? [] : letterNumberNotes(text, facts);

  if (!doc && !streaming) {
    return (
      <div className="flex flex-col gap-4">
        {error && <Notice tone="error">{error}</Notice>}
        {upgrade && <UpgradePrompt message={upgrade} />}
        <div className="rounded-xl border border-border bg-surface p-6 shadow-card">
          <h2 className="text-xl font-bold">Write a cover letter for this job</h2>
          <p className="mt-1 text-fg-muted">
            A short, plain-spoken letter built from the confirmed facts behind your strongest matches. Nothing is added that your facts
            don&apos;t say.
          </p>
          <Button size="lg" className="mt-4" onClick={write} disabled={confirmedCount === 0}>
            <Wand2 className="size-5" aria-hidden /> Write my cover letter
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
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <Notice tone="error">{error}</Notice>}
      {upgrade && <UpgradePrompt message={upgrade} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted" aria-live="polite">
          {streaming
            ? "Writing your letter…"
            : `Version ${doc?.version ?? 1}. ${save === "saving" ? "Saving…" : save === "error" ? "Not saved. Check your connection." : save === "unsaved" ? "Editing…" : "Saved."}`}
        </p>
        {streaming ? (
          <Button variant="secondary" onClick={() => abort.current?.abort()}>
            Cancel
          </Button>
        ) : (
          <Button variant="secondary" onClick={write}>
            <RefreshCw className="size-4" aria-hidden /> Rewrite
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={fieldId}>Your cover letter</Label>
        <Textarea
          id={fieldId}
          value={text}
          readOnly={streaming}
          aria-busy={streaming}
          onChange={(e) => onEdit(e.target.value)}
          onBlur={() => void flush()}
          rows={16}
          className="min-h-80 font-[inherit]"
        />
        <p className="text-sm text-fg-muted" data-testid="word-count">
          {words} {words === 1 ? "word" : "words"}
          {!streaming && words > 0 && (words < 200 || words > 350) ? ". Most good cover letters are 230 to 320 words." : ""}
        </p>
      </div>

      {notes.length > 0 && (
        <Notice tone="warning" title="Check these numbers">
          <ul className="list-disc space-y-1 pl-5">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Notice>
      )}

      {!streaming && doc && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={() => download("docx")} disabled={!!downloading || !text.trim()}>
            <FileText className="size-4" aria-hidden /> {downloading === "docx" ? "Preparing…" : "Download Word"}
          </Button>
          <Button variant="secondary" onClick={() => download("pdf")} disabled={!!downloading || !text.trim()}>
            <Download className="size-4" aria-hidden /> {downloading === "pdf" ? "Preparing…" : "Download PDF"}
          </Button>
          <Button variant="secondary" onClick={copy} disabled={!text.trim()}>
            <Copy className="size-4" aria-hidden /> {copied ? "Copied" : "Copy text"}
          </Button>
        </div>
      )}
    </div>
  );
}
