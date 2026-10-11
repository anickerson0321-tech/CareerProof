import Link from "next/link";
import { Logo } from "@/components/common/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-5 px-4 py-16">
      <Logo />
      <h1 className="text-3xl font-bold">We couldn&apos;t find that page</h1>
      <p className="text-lg text-fg-muted">
        The link may be old, or the item may have been removed. Your vault and applications are still where you left them.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/start">Go to my applications</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/">CareerProof home</Link>
        </Button>
      </div>
    </main>
  );
}
