import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Logo } from "@/components/common/logo";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in", description: "Sign in or create your free CareerProof account." };

export default function LoginPage() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-8">
      <Logo />
      <div className="mt-10 rounded-2xl border border-border bg-surface p-6 shadow-card sm:p-8">
        <Suspense fallback={<p className="text-fg-muted">Loading…</p>}>
          <LoginForm />
        </Suspense>
      </div>
      <p className="mt-6 text-center text-sm text-fg-muted">
        By continuing you agree to the{" "}
        <Link href="/terms" className="font-semibold text-primary underline">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="font-semibold text-primary underline">
          Privacy
        </Link>{" "}
        pages.
      </p>
    </main>
  );
}
