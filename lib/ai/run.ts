import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { costUsd } from "./cost";
import { checkAiLimits } from "./limits";
import { AiError, getProvider, type AiTaskName, type AiUsage, type StructuredRequest, type TextRequest } from "./provider";

// Every AI call goes through here: limits first, then the call, one retry on
// output that fails validation, and a metadata-only ai_calls row either way.
// Prompts and responses are never logged.

export class AiLimitError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AiLimitError";
  }
}

const RETRYABLE_OUTPUT: AiError["code"][] = ["invalid_output", "truncated"];

export async function runStructured<T>(userId: string, request: StructuredRequest<T>): Promise<T> {
  await enforceLimits(userId);
  const provider = await getProvider();
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const started = Date.now();
    try {
      const result = await provider.structured(request);
      await logCall(userId, request.task, result.usage, Date.now() - started, true, null);
      return result.data;
    } catch (error) {
      const aiError = error instanceof AiError ? error : new AiError("provider_error", "Unexpected AI error.");
      await logCall(userId, request.task, null, Date.now() - started, false, aiError.code);
      lastError = aiError;
      if (!RETRYABLE_OUTPUT.includes(aiError.code)) break;
    }
  }
  throw lastError;
}

export async function startTextStream(userId: string, request: TextRequest) {
  await enforceLimits(userId);
  const provider = await getProvider();
  const started = Date.now();
  const stream = provider.streamText(request);
  const finished = stream.done.then(
    (usage) => logCall(userId, request.task, usage, Date.now() - started, true, null),
    (error: unknown) =>
      logCall(userId, request.task, null, Date.now() - started, false, error instanceof AiError ? error.code : "provider_error"),
  );
  return { chunks: stream.chunks, done: stream.done, logged: finished };
}

async function enforceLimits(userId: string) {
  const problem = await checkAiLimits(userId);
  if (problem) throw new AiLimitError(problem.code, problem.message);
}

async function logCall(
  userId: string,
  task: AiTaskName,
  usage: AiUsage | null,
  latencyMs: number,
  success: boolean,
  errorCode: string | null,
) {
  const admin = createAdminClient();
  const { error } = await admin.from("ai_calls").insert({
    user_id: userId,
    task,
    model: usage?.model ?? "unknown",
    input_tokens: usage?.inputTokens ?? 0,
    output_tokens: usage?.outputTokens ?? 0,
    cost_usd: usage ? costUsd(usage.model, usage.inputTokens, usage.outputTokens) : 0,
    latency_ms: latencyMs,
    success,
    error_code: errorCode,
  });
  if (error) console.error("ai_calls insert failed", { task, code: error.code });
}

/** Plain-language message for an AI failure. */
export function aiErrorMessage(error: unknown): { status: number; message: string } {
  if (error instanceof AiLimitError) return { status: 429, message: error.message };
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
