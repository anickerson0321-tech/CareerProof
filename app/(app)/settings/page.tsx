import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Download } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PLAN_LIMITS } from "@/lib/billing/plans";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/common/page-skeleton";
import { ProfileForm } from "@/components/account/profile-form";
import { DeleteAccount } from "@/components/account/delete-account";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold sm:text-3xl">Settings</h1>
      <Suspense fallback={<PageSkeleton label="Loading your settings" />}>
        <Settings />
      </Suspense>
    </div>
  );
}

function monthStartUtc(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

async function Settings() {
  const user = await requireUser("/settings");
  const supabase = await createClient();
  const [{ data: profile }, { count: aiThisMonth }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, email, phone, location, plan, subscription_status, current_period_end, imports_used, applications_created")
      .eq("user_id", user.id)
      .single(),
    supabase.from("ai_calls").select("id", { count: "exact", head: true }).gte("created_at", monthStartUtc()),
  ]);
  const plan = profile?.plan ?? "free";
  const limits = PLAN_LIMITS[plan];

  return (
    <>
      <Section id="details" title="Your details" description="Printed at the top of your resumes and cover letters.">
        <ProfileForm
          initial={{
            full_name: profile?.full_name ?? "",
            email: profile?.email ?? "",
            phone: profile?.phone ?? "",
            location: profile?.location ?? "",
          }}
        />
        <p className="mt-4 text-sm text-fg-muted">
          You sign in as <span className="font-semibold text-fg">{user.email}</span>.
        </p>
      </Section>

      <Section id="plan" title="Plan & usage">
        <p className="text-lg font-semibold">{plan === "pro" ? "Pro" : "Free"}</p>
        {plan === "pro" && profile?.current_period_end && (
          <p className="text-fg-muted">
            {profile.subscription_status === "canceled" ? "Ends" : "Renews"}{" "}
            {new Date(profile.current_period_end).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </p>
        )}
        <dl className="mt-3 grid gap-2 sm:grid-cols-3">
          <Usage label="Applications" used={profile?.applications_created ?? 0} limit={limits.applications} />
          <Usage label="Resume imports" used={profile?.imports_used ?? 0} limit={limits.imports} />
          <Usage label="AI requests this month" used={aiThisMonth ?? 0} />
        </dl>
        {plan === "free" && (
          <Button asChild className="mt-4">
            <Link href="/upgrade">See Pro plans</Link>
          </Button>
        )}
      </Section>

      <Section id="data" title="Your data" description="Your whole Career Vault and every application, as a JSON file.">
        <Button asChild variant="secondary">
          <a href="/api/account/export" download>
            <Download className="size-4" aria-hidden /> Download my data
          </a>
        </Button>
      </Section>

      <Section id="delete" title="Delete my account" tone="danger">
        <DeleteAccount />
      </Section>
    </>
  );
}

function Section({
  id,
  title,
  description,
  tone,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  tone?: "danger";
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${id}-heading`}
      className={`rounded-xl border bg-surface p-5 shadow-card sm:p-6 ${tone === "danger" ? "border-danger/40" : "border-border"}`}
    >
      <h2 id={`${id}-heading`} className="text-xl font-bold">
        {title}
      </h2>
      {description && <p className="mt-1 text-fg-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Usage({ label, used, limit }: { label: string; used: number; limit?: number }) {
  const limited = limit !== undefined && Number.isFinite(limit);
  return (
    <div className="rounded-lg border border-border p-3">
      <dt className="text-sm text-fg-muted">{label}</dt>
      <dd className="text-lg font-semibold">{limited ? `${used} of ${limit} used` : used}</dd>
    </div>
  );
}
