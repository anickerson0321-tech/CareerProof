"use client";

import { useEffect, useState } from "react";
import { Download, FileText, Scissors } from "lucide-react";
import { api } from "@/lib/api/client";
import { downloadFile } from "@/lib/api/download";
import type { PageTarget } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/common/notice";

export interface FitInfo {
  fits: boolean;
  pages: number;
  label: string;
  note: string | null;
  cuts: { id: string; text: string }[];
  pageTarget: PageTarget;
  heldBack: number;
  summaryOmitted: boolean;
  unconfirmedJobs: number;
}

/**
 * Download panel under the resume. Asks the server how the file will lay out
 * (the server is the only judge of what gets exported) and offers Word and PDF.
 */
export function ExportBar({
  documentId,
  revision,
  busy,
  onRemoveLines,
}: {
  documentId: string;
  /** Changes whenever the resume changes, so the layout is re-measured. */
  revision: string;
  busy: boolean;
  onRemoveLines: (ids: string[]) => Promise<void>;
}) {
  const [fit, setFit] = useState<FitInfo | null>(null);
  const [measuring, setMeasuring] = useState(true);
  const [fitError, setFitError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<"docx" | "pdf" | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    if (busy) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setMeasuring(true);
      api<FitInfo>(`/api/documents/${documentId}/fit`, { signal: controller.signal })
        .then((info) => {
          setFit(info);
          setFitError(null);
        })
        .catch((e: unknown) => {
          if (!controller.signal.aborted) setFitError(e instanceof Error ? e.message : "We couldn't measure the page layout.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setMeasuring(false);
        });
    }, 600);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [documentId, revision, busy]);

  async function download(format: "docx" | "pdf") {
    setDownloadError(null);
    setDownloading(format);
    try {
      await downloadFile(`/api/documents/${documentId}/export?format=${format}`, `Resume.${format}`);
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : "The download didn't work. Please try again.");
    } finally {
      setDownloading(null);
    }
  }

  const blocked = fit?.pageTarget === "strict_one" && !fit.fits;

  return (
    <section aria-labelledby="export-heading" className="rounded-xl border border-border bg-surface p-5 shadow-card">
      <h2 id="export-heading" className="text-lg font-bold">
        Download
      </h2>

      <p className="mt-1 min-h-6 text-fg-muted" aria-live="polite" data-testid="fit-label">
        {measuring && !fit ? "Measuring the page layout…" : fit ? fit.label : ""}
      </p>

      {fitError && (
        <Notice tone="error" className="mt-3">
          {fitError}
        </Notice>
      )}

      {fit?.note && (
        <Notice tone={blocked ? "warning" : "info"} className="mt-3">
          {fit.note}
        </Notice>
      )}

      {blocked && fit.cuts.length > 0 && (
        <div className="mt-3 rounded-lg border border-border p-4">
          <p className="font-semibold">
            Removing {fit.cuts.length === 1 ? "this line" : `these ${fit.cuts.length} lines`} would fit one page:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[0.95rem]">
            {fit.cuts.map((c) => (
              <li key={c.id}>{c.text}</li>
            ))}
          </ul>
          <Button variant="secondary" className="mt-3" disabled={busy} onClick={() => void onRemoveLines(fit.cuts.map((c) => c.id))}>
            <Scissors className="size-4" aria-hidden /> Remove {fit.cuts.length === 1 ? "this line" : `these ${fit.cuts.length} lines`}
          </Button>
        </div>
      )}

      {fit && (fit.heldBack > 0 || fit.summaryOmitted) && (
        <p className="mt-3 text-sm text-fg-muted">
          {fit.heldBack > 0 && (
            <>
              {fit.heldBack} flagged {fit.heldBack === 1 ? "line is" : "lines are"} left out until you fix or review{" "}
              {fit.heldBack === 1 ? "it" : "them"}.{" "}
            </>
          )}
          {fit.summaryOmitted && <>The summary is flagged, so it&apos;s left out until you fix or review it.</>}
        </p>
      )}

      {downloadError && (
        <Notice tone="error" className="mt-3">
          {downloadError}
        </Notice>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button onClick={() => download("docx")} disabled={!!downloading || busy || blocked}>
          <FileText className="size-4" aria-hidden /> {downloading === "docx" ? "Preparing…" : "Download Word"}
        </Button>
        <Button variant="secondary" onClick={() => download("pdf")} disabled={!!downloading || busy || blocked}>
          <Download className="size-4" aria-hidden /> {downloading === "pdf" ? "Preparing…" : "Download PDF"}
        </Button>
      </div>
    </section>
  );
}
