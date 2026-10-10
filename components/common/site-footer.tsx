import Link from "next/link";
import { LogoMark } from "./logo";

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-fg-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="inline-flex items-center gap-2">
          <LogoMark className="size-6" /> CareerProof. Confirmed means you confirmed it.
        </p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-1">
          <Link href="/privacy" className="inline-flex min-h-11 items-center font-semibold hover:text-fg">
            Privacy
          </Link>
          <Link href="/terms" className="inline-flex min-h-11 items-center font-semibold hover:text-fg">
            Terms
          </Link>
          <Link href="/contact" className="inline-flex min-h-11 items-center font-semibold hover:text-fg">
            Contact
          </Link>
        </nav>
      </div>
    </footer>
  );
}
