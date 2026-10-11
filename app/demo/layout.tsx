import type { Metadata } from "next";
import Link from "next/link";
import { Info } from "lucide-react";
import { SiteFooter } from "@/components/common/site-footer";
import { SiteHeader } from "@/components/common/site-header";
import { Button } from "@/components/ui/button";
import { DemoNav } from "./demo-nav";

export const metadata: Metadata = {
  title: "Example",
  description: "See CareerProof with sample data: a Career Vault, a job match, and a fact-checked resume.",
};

export default function DemoLayout({ children }: LayoutProps<"/demo">) {
  return (
    <>
      <SiteHeader />
      <div className="border-b border-hidden/30 bg-hidden-tint">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="inline-flex items-start gap-2 font-semibold">
            <Info className="mt-0.5 size-5 shrink-0 text-hidden" aria-hidden />
            Sample data for a made-up person. Nothing here can be changed.
          </p>
          <Button asChild size="sm">
            <Link href="/login?mode=signup">Build your own vault</Link>
          </Button>
        </div>
      </div>
      <main id="main" className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <DemoNav />
        <div className="mt-6">{children}</div>
      </main>
      <SiteFooter />
    </>
  );
}
