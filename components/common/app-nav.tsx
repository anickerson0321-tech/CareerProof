"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const APP_NAV = [
  { href: "/applications", label: "Applications" },
  { href: "/vault", label: "Career Vault" },
  { href: "/settings", label: "Settings" },
] as const;

/** The current URL is only known at request time, so the highlighted nav streams in. */
export function AppNav() {
  return (
    <Suspense fallback={<NavLinks pathname={null} />}>
      <CurrentNav />
    </Suspense>
  );
}

function CurrentNav() {
  return <NavLinks pathname={usePathname()} />;
}

function NavLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="App" className="flex gap-1">
      {APP_NAV.map((item) => {
        const active = pathname !== null && (pathname === item.href || pathname.startsWith(`${item.href}/`));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-md px-3 text-[0.95rem] font-semibold whitespace-nowrap",
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
