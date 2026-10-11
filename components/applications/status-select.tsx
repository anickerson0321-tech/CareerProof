"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { APP_STATUSES, type AppStatus } from "@/lib/domain";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export const APP_STATUS_LABELS: Record<AppStatus, string> = {
  draft: "Draft",
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  closed: "Closed",
};

export function StatusSelect({
  applicationId,
  status,
  label = "Status",
  compact = false,
}: {
  applicationId: string;
  status: AppStatus;
  label?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const id = useId();

  return (
    <div className={cn("flex flex-col gap-1", compact && "min-w-36")}>
      <label htmlFor={id} className={cn("text-sm font-semibold", compact && "sr-only")}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={state === "saving"}
        onChange={async (e) => {
          const next = e.target.value as AppStatus;
          const previous = value;
          setValue(next);
          setState("saving");
          try {
            await api(`/api/applications/${applicationId}`, { method: "PATCH", body: { status: next } });
            setState("idle");
            router.refresh();
          } catch {
            setValue(previous);
            setState("error");
          }
        }}
        className="min-h-11 rounded-lg border border-border-strong bg-surface px-3 font-semibold"
      >
        {APP_STATUSES.map((s) => (
          <option key={s} value={s}>
            {APP_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      <span role="status" className={cn("text-xs", state === "error" ? "text-danger" : "sr-only")}>
        {state === "error" ? "Couldn't save. Try again." : state === "saving" ? "Saving" : ""}
      </span>
    </div>
  );
}
