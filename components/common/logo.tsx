import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect x="5" y="3" width="22" height="26" rx="4" className="fill-primary" />
      <path d="M10 10h12M10 15h8" className="stroke-primary-fg" strokeWidth="2.2" strokeLinecap="round" />
      <path d="m11 21.5 3.2 3.2L21.5 17" className="stroke-primary-fg" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center gap-2 rounded-md font-display text-xl font-bold tracking-tight">
      <LogoMark />
      CareerProof
    </Link>
  );
}
