import { CircleCheck, CircleDashed, CircleHelp, CircleSlash, CircleDot } from "lucide-react";
import type { DerivedStatus } from "@/lib/domain";
import { STATUS_LABELS } from "@/lib/matching/status";
import { cn } from "@/lib/utils";

export const STATUS_STYLES: Record<DerivedStatus, { pill: string; solid: string; Icon: typeof CircleCheck }> = {
  strong: { pill: "bg-strong-tint text-strong", solid: "bg-strong-solid", Icon: CircleCheck },
  partial: { pill: "bg-partial-tint text-partial", solid: "bg-partial-solid", Icon: CircleDot },
  hidden: { pill: "bg-hidden-tint text-hidden", solid: "bg-hidden-solid", Icon: CircleHelp },
  unknown: { pill: "bg-unknown-tint text-unknown", solid: "bg-unknown-solid", Icon: CircleDashed },
  gap: { pill: "bg-gap-tint text-gap", solid: "bg-gap-solid", Icon: CircleSlash },
};

export function StatusPill({ status, className }: { status: DerivedStatus; className?: string }) {
  const { pill, Icon } = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold leading-none whitespace-nowrap",
        pill,
        className,
      )}
    >
      <Icon className="size-4" aria-hidden />
      {STATUS_LABELS[status]}
    </span>
  );
}
