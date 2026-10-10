import { Ban, CircleCheck, TriangleAlert, UserCheck } from "lucide-react";
import { BADGE_LABELS, type GuardBadge as Badge } from "@/lib/guard/truth-guard";
import { cn } from "@/lib/utils";

const STYLES: Record<Badge, { cls: string; Icon: typeof Ban }> = {
  supported: { cls: "bg-strong-tint text-strong", Icon: CircleCheck },
  check: { cls: "bg-partial-tint text-partial", Icon: TriangleAlert },
  blocked: { cls: "bg-gap-tint text-gap", Icon: Ban },
  reviewed: { cls: "bg-hidden-tint text-hidden", Icon: UserCheck },
};

export function GuardBadge({ badge, className }: { badge: Badge; className?: string }) {
  const { cls, Icon } = STYLES[badge];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-sans text-xs font-semibold whitespace-nowrap",
        cls,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {BADGE_LABELS[badge]}
    </span>
  );
}
