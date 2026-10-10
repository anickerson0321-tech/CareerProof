import type { Plan } from "@/lib/domain";

// Plan limits are enforced on the server (see lib/billing). The prices here are
// for display; the real prices live in Stripe and are selected by
// STRIPE_PRICE_PRO_MONTHLY / STRIPE_PRICE_PRO_YEARLY.

export const PLAN_LIMITS: Record<Plan, { imports: number; applications: number; coverLetters: boolean }> = {
  free: { imports: 1, applications: 2, coverLetters: false },
  pro: { imports: Number.POSITIVE_INFINITY, applications: Number.POSITIVE_INFINITY, coverLetters: true },
};

export const PRO_PRICES = {
  monthly: { amount: 12, label: "$12", per: "month" },
  yearly: { amount: 96, label: "$96", per: "year", note: "That's $8 a month" },
} as const;

export const PLAN_FEATURES: Record<Plan, string[]> = {
  free: [
    "Build your Career Vault from 1 resume",
    "2 job applications",
    "Tailored resume for each, fact-checked",
    "Word and PDF downloads with no watermark",
  ],
  pro: [
    "Everything in Free",
    "Unlimited applications",
    "Add more resumes to your vault",
    "Cover letters for every application",
  ],
};
