import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { FileText, ListChecks, Lock } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PLAN_LIMITS } from "@/lib/billing/plans";
import { ResumeIntake } from "@/components/vault/resume-intake";
import { PageSkeleton } from "@/components/common/page-skeleton";

export const metadata: Metadata = { title: "Add your resume" };

export default function OnboardingPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading" />}>
      <Onboarding />
    </Suspense>
  );
}

async function Onboarding() {
  const user = await requireUser("/onboarding");
  const supabase = await createClient();
  const [{ data: profile }, { count }] = await Promise.all([
    supabase.from("profiles").select("full_name, plan, imports_used").eq("user_id", user.id).maybeSingle(),
    supabase.from("facts").select("id", { count: "exact", head: true }).neq("status", "unsupported"),
  ]);
  // Onboarding is for an empty vault; after that, more resumes go through the vault.
  if ((count ?? 0) > 0) redirect("/vault/add-resume");
  const firstName = profile?.full_name?.trim().split(/\s+/)[0];
  const blocked = profile ? profile.imports_used >= PLAN_LIMITS[profile.plan].imports : false;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold">
          {firstName ? `Welcome, ${firstName}.` : "Welcome."} Let&apos;s build your Career Vault.
        </h1>
        <p className="mt-2 max-w-2xl text-lg text-fg-muted">
          Your vault is a list of facts about your career that you&apos;ve checked and confirmed. Every resume CareerProof
          writes for you is built only from these facts.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="add-heading" className="flex flex-col gap-4">
          <h2 id="add-heading" className="text-xl font-bold">
            Add your resume
          </h2>
          <ResumeIntake
            mode="first"
            upgradeMessage={
              blocked
                ? "Your free resume import has been used. Upgrade to Pro to import another, or add facts to your vault yourself."
                : null
            }
          />
        </section>

        <ol className="flex flex-col gap-3" aria-label="What happens next">
          <Step Icon={FileText} title="We read it" body="You'll see exactly what text we read before anything else happens." />
          <Step
            Icon={ListChecks}
            title="You check each fact"
            body="We split your resume into jobs, duties, skills and education. Fix anything that's off, then confirm."
          />
          <Step
            Icon={Lock}
            title="It stays yours"
            body="Your file is stored privately. Only the text is sent to our AI provider to read it. Delete everything any time."
          />
        </ol>
      </div>
    </div>
  );
}

function Step({ Icon, title, body }: { Icon: typeof FileText; title: string; body: string }) {
  return (
    <li className="flex gap-3 rounded-xl border border-border bg-surface p-4">
      <Icon className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden />
      <div>
        <h3 className="font-sans font-bold">{title}</h3>
        <p className="text-sm text-fg-muted">{body}</p>
      </div>
    </li>
  );
}
