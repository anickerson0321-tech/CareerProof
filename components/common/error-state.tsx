"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Shown when a page fails unexpectedly. Says what happened and offers a way forward. */
export function ErrorState({ error, retry, home = "/" }: { error: Error & { digest?: string }; retry: () => void; home?: string }) {
  useEffect(() => {
    // The digest matches the server log entry; never log page content.
    console.error("Page error", error.digest ?? error.name);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-xl flex-col items-start gap-4 rounded-xl border border-border bg-surface p-6 shadow-card" role="alert">
      <CircleAlert className="size-8 text-danger" aria-hidden />
      <h1 className="text-2xl font-bold">Something went wrong on our side</h1>
      <p className="text-fg-muted">
        Your work is saved. Try again, and if it keeps happening, wait a minute and reload the page.
        {error.digest && <span className="mt-2 block text-sm">Reference: {error.digest}</span>}
      </p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => retry()}>Try again</Button>
        <Button asChild variant="secondary">
          <Link href={home}>Go back home</Link>
        </Button>
      </div>
    </div>
  );
}
