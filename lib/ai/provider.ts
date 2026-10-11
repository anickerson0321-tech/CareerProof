import "server-only";
import type { z } from "zod";

// Provider-neutral interface for every AI call. Swap the model or vendor by
// adding another implementation; nothing outside lib/ai knows which one runs.
// The AI never decides verification status, ownership or permissions: callers
// validate and post-process every result in code.

export type AiTaskName =
  | "extract_resume"
  | "analyze_posting"
  | "answer_to_fact"
  | "generate_resume"
  | "fact_check"
  | "cover_letter";

/** "default" = the main model; "fast" = small quick tasks (answer cleanup). */
export type ModelTier = "default" | "fast";

export interface AiUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

interface BaseRequest {
  task: AiTaskName;
  tier: ModelTier;
  system: string;
  prompt: string;
  maxTokens: number;
  signal?: AbortSignal;
  /** Stable key for recorded fixtures (mock provider and tests). */
  fixtureKey: string;
}

export interface StructuredRequest<T> extends BaseRequest {
  schema: z.ZodType<T>;
}

export interface StructuredResult<T> {
  data: T;
  usage: AiUsage;
}

export type TextRequest = BaseRequest;

export interface TextStream {
  chunks: AsyncIterable<string>;
  /** Resolves with usage once the stream has finished. */
  done: Promise<AiUsage>;
}

export interface AiProvider {
  readonly name: string;
  structured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>>;
  streamText(request: TextRequest): TextStream;
}

export type AiErrorCode =
  | "invalid_output"
  | "refused"
  | "truncated"
  | "rate_limited"
  | "overloaded"
  | "aborted"
  | "provider_error"
  | "not_configured"
  | "missing_fixture";

export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string,
    readonly retryable = false,
    /** Tokens the provider billed for this failed call, when it reported them. */
    readonly usage: AiUsage | null = null,
  ) {
    super(message);
    this.name = "AiError";
  }
}

let cached: AiProvider | null = null;

export async function getProvider(): Promise<AiProvider> {
  if (cached) return cached;
  const which = (process.env.AI_PROVIDER ?? "anthropic").toLowerCase();
  if (which === "mock") {
    const { MockProvider } = await import("./mock");
    cached = new MockProvider();
  } else {
    const { AnthropicProvider } = await import("./anthropic");
    cached = new AnthropicProvider();
  }
  return cached;
}

/** For tests: use a specific provider. */
export function setProvider(provider: AiProvider | null) {
  cached = provider;
}
