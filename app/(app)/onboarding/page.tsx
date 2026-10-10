import type { Metadata } from "next";
import { Suspense } from "react";
import { FileText, ListChecks, Lock } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Add your resume" };

export default function OnboardingPage() {
  return (
    <Suspense fallback={<p className="text-fg-muted">Loading…</p>}>
      <Onboarding />
    </Suspense>
  );
}

async function Onboarding() {
  const user = await requireUser("/onboarding");
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle();
  const firstName = profile?.full_name?.trim().split(/\s+/)[0];

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold">{firstName ? `Welcome, ${firstName}.` : "Welcome."} Let&apos;s build your Career Vault.</h1>
        <p className="mt-2 max-w-2xl text-lg text-fg-muted">
          Your vault is a list of facts about your career that you&apos;ve checked and confirmed. Every resume CareerProof
          writes for you is built only from these facts.
        </p>
      </header>

      <ol className="grid gap-4 sm:grid-cols-3">
        <Step
          Icon={FileText}
          title="Add your resume"
          body="Upload a Word, PDF or text file (up to 5 MB), or paste it in. You'll see exactly what we read."
        />
        <Step
          Icon={ListChecks}
          title="Check each fact"
          body="We split your resume into jobs, duties, skills and education. Fix anything that's off, then confirm."
        />
        <Step
          Icon={Lock}
          title="It stays yours"
          body="Your files are private. Only the text a task needs is sent to our AI provider. Delete everything any time."
        />
      </ol>
    </div>
  );
}

function Step({ Icon, title, body }: { Icon: typeof FileText; title: string; body: string }) {
  return (
    <li className="rounded-xl border border-border bg-surface p-5 shadow-card">
      <Icon className="size-7 text-primary" aria-hidden />
      <h2 className="mt-3 text-lg font-bold">{title}</h2>
      <p className="mt-1 text-fg-muted">{body}</p>
    </li>
  );
}
