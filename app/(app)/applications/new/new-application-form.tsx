"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Notice, UpgradePrompt } from "@/components/common/notice";
import { ProgressState } from "@/components/common/progress-state";
import { api, ApiClientError } from "@/lib/api/client";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { track } from "@/lib/analytics";

export function NewApplicationForm() {
  const router = useRouter();
  const [posting, setPosting] = useState("");
  const [url, setUrl] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<{ message: string; upgrade: boolean } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const id = useId();
  const hydrated = useHydrated();

  async function compare(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setWorking(true);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const { id: appId } = await api<{ id: string }>("/api/applications", {
        body: { postingText: posting, postingUrl: url.trim() || null },
        signal: controller.signal,
      });
      track("Application created");
      router.push(`/applications/${appId}`);
    } catch (err) {
      setWorking(false);
      if (err instanceof ApiClientError && err.code === "aborted") return;
      setError(
        err instanceof ApiClientError ? { message: err.message, upgrade: err.upgrade } : { message: "Something went wrong. Please try again.", upgrade: false },
      );
    }
  }

  if (working) {
    return (
      <ProgressState
        title="Comparing with your career…"
        timing="This usually takes 20 to 45 seconds. We're reading the posting and checking each requirement against your facts."
        stillWorking="Still comparing. Long postings can take up to a minute."
        onCancel={() => abort.current?.abort()}
      />
    );
  }

  return (
    <form onSubmit={compare} className="flex flex-col gap-4" data-form-ready={hydrated ? "" : undefined}>
      {error && (error.upgrade ? <UpgradePrompt message={error.message} /> : <Notice tone="error">{error.message}</Notice>)}
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-posting`}>Job posting</Label>
        <Textarea
          id={`${id}-posting`}
          value={posting}
          onChange={(e) => setPosting(e.target.value)}
          className="min-h-80"
          maxLength={40_000}
          placeholder="Copy the whole job posting (title, duties, requirements) and paste it here."
          aria-describedby={`${id}-posting-hint`}
        />
        <p id={`${id}-posting-hint`} className="text-xs text-fg-muted">
          Include the requirements section. Pay, benefits and company info are fine to leave in; we ignore them.
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-url`}>Link to the posting (optional)</Label>
        <Input
          id={`${id}-url`}
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://"
          aria-describedby={`${id}-url-hint`}
        />
        <p id={`${id}-url-hint`} className="text-xs text-fg-muted">
          Saved for your reference so you can find the posting again.
        </p>
      </div>
      <Button type="submit" size="lg" className="self-start" disabled={!hydrated || posting.trim().length < 50}>
        Compare with my career
      </Button>
    </form>
  );
}
