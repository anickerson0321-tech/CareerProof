"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/demo", label: "Career Vault" },
  { href: "/demo/application", label: "Application: Training & Compliance Coordinator" },
] as const;

export function DemoNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Example sections" className="flex flex-col gap-2 sm:flex-row">
      {LINKS.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-lg border px-4 font-semibold",
              active ? "border-primary bg-strong-tint text-strong" : "border-border bg-surface text-fg hover:bg-surface-2",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
