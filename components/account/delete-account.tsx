"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { DELETE_CONFIRMATION } from "@/lib/account/profile";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Notice } from "@/components/common/notice";

export function DeleteAccount() {
  const hydrated = useHydrated();
  const router = useRouter();
  const id = useId();
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = typed.trim() === DELETE_CONFIRMATION;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setDeleting(true);
    setError(null);
    try {
      await api("/api/account", { method: "DELETE", body: { confirm: DELETE_CONFIRMATION } });
      router.replace("/account-deleted");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't delete your account. Please try again.");
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p>
        This permanently deletes your Career Vault, every application, resume and cover letter, and your uploaded files. If you have Pro,
        your subscription is cancelled. This can&apos;t be undone.
      </p>
      <p className="text-fg-muted">Want a copy first? Use Download my data above.</p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>Type {DELETE_CONFIRMATION} to confirm</Label>
        <Input
          id={id}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="sm:max-w-xs"
        />
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" variant="danger" className="self-start" disabled={!hydrated || !ready || deleting}>
        {deleting ? "Deleting…" : "Delete my account"}
      </Button>
    </form>
  );
}
