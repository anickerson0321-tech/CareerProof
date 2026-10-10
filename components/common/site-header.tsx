import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-bg/90 backdrop-blur supports-[backdrop-filter]:bg-bg/75">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
        <Logo />
        <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
          <Link href="/#pricing" className="hidden min-h-11 items-center rounded-md px-3 font-semibold text-fg-muted hover:text-fg sm:inline-flex">
            Pricing
          </Link>
          <Link href="/demo" className="hidden min-h-11 items-center rounded-md px-3 font-semibold text-fg-muted hover:text-fg sm:inline-flex">
            Example
          </Link>
          <ThemeToggle />
          <Button asChild variant="ghost">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild className="hidden sm:inline-flex">
            <Link href="/login?mode=signup">Get started free</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
