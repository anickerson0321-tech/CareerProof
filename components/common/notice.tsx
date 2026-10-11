import Link from "next/link";
import { CircleAlert, CircleCheck, Info, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tone = "error" | "warning" | "info" | "success";

const TONES: Record<Tone, { cls: string; Icon: typeof Info }> = {
  error: { cls: "border-danger/30 bg-danger-tint text-danger", Icon: CircleAlert },
  warning: { cls: "border-partial/30 bg-partial-tint text-partial", Icon: CircleAlert },
  info: { cls: "border-hidden/30 bg-hidden-tint text-hidden", Icon: Info },
  success: { cls: "border-strong/30 bg-strong-tint text-strong", Icon: CircleCheck },
};

export function Notice({
  tone,
  title,
  children,
  className,
}: {
  tone: Tone;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const { cls, Icon } = TONES[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-xl border p-4", cls, className)}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 text-fg">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && "mt-1", "text-[0.95rem]")}>{children}</div>}
      </div>
    </div>
  );
}

/** Shown when a plan limit is reached: explains and offers the way forward. */
export function UpgradePrompt({ message, className }: { message: string; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-primary/40 bg-strong-tint p-5", className)} role="status">
      <p className="flex items-center gap-2 font-semibold text-strong">
        <Sparkles className="size-5" aria-hidden /> This is a Pro feature
      </p>
      <p className="mt-1 text-fg">{message}</p>
      <Button asChild className="mt-4">
        <Link href="/upgrade">See Pro plans</Link>
      </Button>
    </div>
  );
}
