import Link from "next/link";
import { Check, ClipboardPaste, Download, ListChecks, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/match/status-pill";
import { PLAN_FEATURES, PRO_PRICES } from "@/lib/billing/plans";

const STEPS = [
  {
    Icon: ListChecks,
    title: "Build your vault",
    body: "Upload your resume once. We split it into individual facts (jobs, duties, skills, education) and you confirm each one.",
  },
  {
    Icon: ClipboardPaste,
    title: "Paste a job",
    body: "See which requirements your facts support, in plain language. We ask a few questions only where something is unclear.",
  },
  {
    Icon: Download,
    title: "Download your resume",
    body: "Get a tailored resume and cover letter in Word or PDF, where every line traces back to a fact you confirmed.",
  },
];

const FAQ = [
  {
    q: "What does “Confirmed” mean?",
    a: "It means you looked at a fact and said it's true. CareerProof never claims an employer, school or certifying body checked anything.",
  },
  {
    q: "Will it make things up to fill gaps?",
    a: "No. Every line on your resume has to point to facts you confirmed. Lines that claim more than your facts say (bigger numbers, “managed” instead of “helped”) are flagged and kept out of your download until you fix them or confirm they're accurate.",
  },
  {
    q: "What happens if I'm missing something a job asks for?",
    a: "If your record doesn't mention it, we say “Not in your record yet”, not “you don't have this”. When an answer could help, we ask one focused question. Your answer is saved to your vault, so you won't be asked again.",
  },
  {
    q: "Who sees my resume?",
    a: "Only you. Your files are stored privately. To read your resume and compare it with job postings, the relevant text is sent to our AI provider for processing. We don't sell your data, and you can download or delete everything at any time.",
  },
  {
    q: "What files can I upload?",
    a: "Word (.docx), PDF, or plain text, up to 5 MB. You can also paste your resume. If a PDF is a scan with no readable text, we'll tell you and suggest what to do instead.",
  },
  {
    q: "Can I cancel Pro?",
    a: "Yes, any time, from Settings. You keep Pro until the end of the period you paid for, and your vault stays yours.",
  },
];

export default function LandingPage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 pb-14 pt-12 sm:px-6 sm:pt-20">
        <div className="max-w-3xl">
          <h1 className="text-[2.6rem] font-bold leading-[1.05] sm:text-6xl">Your career, on the record.</h1>
          <p className="mt-5 max-w-2xl text-lg text-fg-muted sm:text-xl">
            CareerProof remembers your career, explains how it matches each job, asks only what it still needs, and writes
            resumes you can defend in an interview.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/login?mode=signup">Get started free</Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href="/demo">See an example</Link>
            </Button>
          </div>
          <p className="mt-4 text-sm text-fg-muted">No card needed. Two applications free.</p>
        </div>
      </section>

      <section aria-labelledby="how-heading" className="border-y border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 id="how-heading" className="text-3xl font-bold">
            How it works
          </h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex flex-col gap-3">
                <span className="inline-flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-full bg-strong-tint font-display text-lg font-bold text-strong">
                    {i + 1}
                  </span>
                  <step.Icon className="size-6 text-primary" aria-hidden />
                </span>
                <h3 className="text-xl font-bold">{step.title}</h3>
                <p className="text-fg-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="example-heading" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-start">
          <div>
            <h2 id="example-heading" className="text-3xl font-bold">
              Every match, explained
            </h2>
            <p className="mt-3 text-lg text-fg-muted">
              For each requirement in a job posting, you see what in your record supports it, and what doesn&apos;t yet. Tap a
              fact code to see the fact itself.
            </p>
            <ul className="mt-6 flex flex-col gap-3">
              {[
                "Years of experience are added up from your dates, with overlapping jobs counted once.",
                "Finishing a training isn't treated as running it. Helping coworkers isn't treated as supervising them.",
                "A degree in progress is never shown as completed.",
              ].map((line) => (
                <li key={line} className="flex gap-2">
                  <Check className="mt-1 size-5 shrink-0 text-primary" aria-hidden />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-4" aria-label="Example match cards">
            <ExampleCard
              status="strong"
              title="Experience training or onboarding staff"
              explanation="You trained 12 new custodial staff on chemical safety and isolation-room cleaning."
              codes={["E3"]}
            />
            <ExampleCard
              status="partial"
              title="Experience tracking and reporting training completion"
              explanation="You tracked safety-training completion for your crew. Your record doesn't say whether you reported it to anyone."
              codes={["E21", "E6"]}
              question="You tracked annual safety-training completion for your 5-person crew in a spreadsheet. Did you also share or report those records to a manager or auditor? If so, who received them and how often?"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col items-start gap-4 rounded-2xl bg-primary p-7 text-primary-fg sm:flex-row sm:items-center sm:p-10">
          <ShieldCheck className="size-12 shrink-0" aria-hidden />
          <p className="font-display text-2xl font-bold leading-snug sm:text-3xl">
            Confirmed means you confirmed it. CareerProof won&apos;t write a line your facts don&apos;t support.
          </p>
        </div>
      </section>

      <section id="pricing" aria-labelledby="pricing-heading" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
        <h2 id="pricing-heading" className="text-3xl font-bold">
          Pricing
        </h2>
        <p className="mt-2 text-lg text-fg-muted">Start free. Upgrade when you&apos;re applying to more jobs.</p>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <PriceCard
            name="Free"
            price="$0"
            per="forever"
            features={PLAN_FEATURES.free}
            cta={
              <Button asChild variant="secondary" size="lg" className="w-full">
                <Link href="/login?mode=signup">Get started free</Link>
              </Button>
            }
          />
          <PriceCard
            name="Pro"
            price={PRO_PRICES.monthly.label}
            per={`per ${PRO_PRICES.monthly.per}`}
            alt={`or ${PRO_PRICES.yearly.label} per ${PRO_PRICES.yearly.per}. ${PRO_PRICES.yearly.note}.`}
            features={PLAN_FEATURES.pro}
            highlight
            cta={
              <Button asChild size="lg" className="w-full">
                <Link href="/login?mode=signup">Start free, upgrade anytime</Link>
              </Button>
            }
          />
        </div>
      </section>

      <section aria-labelledby="faq-heading" className="mx-auto max-w-3xl px-4 sm:px-6">
        <h2 id="faq-heading" className="text-3xl font-bold">
          Questions
        </h2>
        <div className="mt-6 divide-y divide-border rounded-xl border border-border bg-surface">
          {FAQ.map((item) => (
            <details key={item.q} className="group p-5">
              <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                {item.q}
                <span aria-hidden className="text-xl text-fg-muted transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-fg-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}

function ExampleCard({
  status,
  title,
  explanation,
  codes,
  question,
}: {
  status: "strong" | "partial";
  title: string;
  explanation: string;
  codes: string[];
  question?: string;
}) {
  return (
    <article className="rounded-xl border border-border bg-surface p-5 shadow-card">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <h3 className="font-sans text-base font-semibold">{title}</h3>
        <StatusPill status={status} className="self-start" />
      </div>
      <p className="mt-2 text-fg-muted">{explanation}</p>
      <p className="mt-3 flex flex-wrap items-center gap-1.5 text-sm text-fg-muted">
        Based on
        {codes.map((c) => (
          <span key={c} className="rounded-md border border-border-strong bg-surface-2 px-2 py-0.5 font-mono font-semibold text-fg">
            {c}
          </span>
        ))}
      </p>
      {question && (
        <div className="mt-4 rounded-lg border-l-4 border-partial-solid bg-partial-tint/60 p-3">
          <p className="text-sm font-semibold text-partial">The question it asks</p>
          <p className="mt-1">{question}</p>
        </div>
      )}
    </article>
  );
}

function PriceCard({
  name,
  price,
  per,
  alt,
  features,
  cta,
  highlight,
}: {
  name: string;
  price: string;
  per: string;
  alt?: string;
  features: string[];
  cta: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <article
      className={`flex flex-col rounded-2xl border bg-surface p-6 shadow-card ${highlight ? "border-primary ring-1 ring-primary" : "border-border"}`}
    >
      <h3 className="text-xl font-bold">{name}</h3>
      <p className="mt-3">
        <span className="font-display text-4xl font-bold">{price}</span> <span className="text-fg-muted">{per}</span>
      </p>
      {alt && <p className="mt-1 text-sm text-fg-muted">{alt}</p>}
      <ul className="mb-6 mt-5 flex flex-col gap-2.5">
        {features.map((f) => (
          <li key={f} className="flex gap-2">
            <Check className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
            {f}
          </li>
        ))}
      </ul>
      <div className="mt-auto">{cta}</div>
    </article>
  );
}
