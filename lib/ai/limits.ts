import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { costUsd } from "./cost";
import { modelFor } from "./models";
import type { AiTaskName, ModelTier } from "./provider";

// Per-user protection for AI routes. Each call first reserves a row in
// ai_calls through one locked database function (reserve_ai_call), so parallel
// requests can't all slip under the limits; the row starts at a worst-case
// cost and is corrected once the call finishes.

export const RATE_LIMITS = { perMinute: 10, perDay: 200 };

/** Longest prompt we'll send. Anything bigger is a mistake or abuse. */
export const MAX_PROMPT_CHARS = 200_000;

export type LimitCode = "rate_minute" | "rate_day" | "cost_cap" | "too_large";

export const LIMIT_MESSAGES: Record<LimitCode, string> = {
  rate_minute: "You're going a bit fast. Wait a minute, then try again.",
  rate_day: "You've reached today's limit for AI requests. It resets within 24 hours.",
  cost_cap: "You've reached this month's fair-use limit for AI processing. It resets on the 1st. If you need more, contact us.",
  too_large: "That's more text than we can process at once. Shorten it and try again.",
};

export function monthlyCapUsd(): number {
  const value = Number(process.env.AI_MONTHLY_COST_CAP_USD);
  return Number.isFinite(value) && value > 0 ? value : 5;
}

/** Worst case for one call: roughly 3 characters per input token, and every output token used. */
export function estimateCost(tier: ModelTier, system: string, prompt: string, maxTokens: number): { model: string; cost: number } {
  const model = modelFor(tier);
  return { model, cost: costUsd(model, Math.ceil((system.length + prompt.length) / 3), maxTokens) };
}

export type Reservation = { ok: true; id: string; estimate: number } | { ok: false; code: LimitCode };

export async function reserveAiCall(
  userId: string,
  request: { task: AiTaskName; tier: ModelTier; system: string; prompt: string; maxTokens: number },
): Promise<Reservation> {
  if (request.system.length + request.prompt.length > MAX_PROMPT_CHARS) return { ok: false, code: "too_large" };
  const { model, cost } = estimateCost(request.tier, request.system, request.prompt, request.maxTokens);
  const { data, error } = await createAdminClient().rpc("reserve_ai_call", {
    p_user: userId,
    p_task: request.task,
    p_model: model,
    p_estimate: Number(cost.toFixed(6)),
    p_per_minute: RATE_LIMITS.perMinute,
    p_per_day: RATE_LIMITS.perDay,
    p_cap: monthlyCapUsd(),
  });
  if (error) {
    const code = error.message as LimitCode;
    if (code === "rate_minute" || code === "rate_day" || code === "cost_cap") return { ok: false, code };
    // Fail closed: if we can't account for the call, don't make it.
    throw new Error(`AI reservation failed: ${error.code}`);
  }
  return { ok: true, id: data, estimate: cost };
}
