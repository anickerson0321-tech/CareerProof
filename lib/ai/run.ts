import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { costUsd } from "./cost";
import { LIMIT_MESSAGES, reserveAiCall, type LimitCode } from "./limits";
import { AiError, getProvider, type AiUsage, type StructuredRequest, type TextRequest } from "./provider";

// Every AI call goes through here: reserve a slot (limits), make the call,
// retry once on output that fails validation, and settle the ai_calls row
// with what it really cost. Prompts and responses are never logged.

export class AiLimitError extends Error {
  constructor(
    readonly code: LimitCode,
    message: string,
  ) {
    super(message);
    this.name = "AiLimitError";
  }
}

const RETRYABLE_OUTPUT: AiError["code"][] = ["invalid_output", "truncated"];

async function reserve(userId: string, request: StructuredRequest<unknown> | TextRequest) {
  const reservation = await reserveAiCall(userId, request);
  if (!reservation.ok) throw new AiLimitError(reservation.code, LIMIT_MESSAGES[reservation.code]);
  return reservation;
}

export async function runStructured<T>(userId: string, request: StructuredRequest<T>): Promise<T> {
  const provider = await getProvider();
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const slot = await reserve(userId, request as StructuredRequest<unknown>);
    const started = Date.now();
    try {
      const result = await provider.structured(request);
      await settle(slot, result.usage, Date.now() - started, null);
      return result.data;
    } catch (error) {
      const aiError = error instanceof AiError ? error : new AiError("provider_error", "Unexpected AI error.");
      await settle(slot, aiError.usage, Date.now() - started, aiError.code);
      lastError = aiError;
      if (!RETRYABLE_OUTPUT.includes(aiError.code)) break;
    }
  }
  throw lastError;
}

export async function startTextStream(userId: string, request: TextRequest) {
  const slot = await reserve(userId, request);
  const provider = await getProvider();
  const started = Date.now();
  const stream = provider.streamText(request);
  const finished = stream.done.then(
    (usage) => settle(slot, usage, Date.now() - started, null),
    (error: unknown) =>
      settle(slot, error instanceof AiError ? error.usage : null, Date.now() - started, error instanceof AiError ? error.code : "provider_error"),
  );
  return { chunks: stream.chunks, done: stream.done, logged: finished };
}

/**
 * Records what the call really cost. A failure the provider reported usage
 * for is billed at that usage. A cancelled call with no usage keeps the
 * worst-case estimate (the model may have kept working). Anything else that
 * failed before the model ran costs nothing.
 */
async function settle(slot: { id: string; estimate: number }, usage: AiUsage | null, latencyMs: number, errorCode: string | null) {
  const cost = usage ? costUsd(usage.model, usage.inputTokens, usage.outputTokens) : errorCode === "aborted" ? slot.estimate : 0;
  const { error } = await createAdminClient()
    .from("ai_calls")
    .update({
      ...(usage ? { model: usage.model, input_tokens: usage.inputTokens, output_tokens: usage.outputTokens } : {}),
      cost_usd: Number(cost.toFixed(6)),
      latency_ms: latencyMs,
      success: errorCode === null,
      error_code: errorCode,
    })
    .eq("id", slot.id);
  if (error) console.error("ai_calls update failed", { code: error.code });
}

/** Plain-language message for an AI failure. */
export function aiErrorMessage(error: unknown): { status: number; message: string } {
  if (error instanceof AiLimitError) return { status: error.code === "too_large" ? 413 : 429, message: error.message };
  if (error instanceof AiError) {
    switch (error.code) {
      case "aborted":
        return { status: 499, message: "Cancelled. Nothing was saved." };
      case "refused":
        return {
          status: 422,
          message: "The AI couldn't process this text. Check that it's a resume or job posting and try again.",
        };
      case "rate_limited":
      case "overloaded":
        return { status: 503, message: "The AI service is busy right now. Wait a minute and try again." };
      case "not_configured":
        return { status: 503, message: "AI isn't set up on this server yet. Please contact support." };
      case "invalid_output":
      case "truncated":
        return {
          status: 502,
          message: "The AI gave an answer we couldn't use, even after a second try. Please try again.",
        };
      default:
        return { status: 502, message: "Something went wrong talking to the AI service. Please try again." };
    }
  }
  return { status: 500, message: "Something went wrong. Please try again." };
}
