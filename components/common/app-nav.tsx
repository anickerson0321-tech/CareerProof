"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const APP_NAV = [{ href: "/vault", label: "Career Vault" }] as const;

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="App" className="flex gap-1">
      {APP_NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-md px-3 text-[0.95rem] font-semibold",
              active ? "bg-strong-tint text-strong" : "text-fg-muted hover:text-fg",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
