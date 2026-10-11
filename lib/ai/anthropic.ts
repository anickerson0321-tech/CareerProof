import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { AiError, type AiProvider, type AiUsage, type ModelTier, type StructuredRequest, type StructuredResult, type TextRequest, type TextStream } from "./provider";

// Anthropic implementation. JSON is forced with structured outputs
// (output_config.format), then validated again with Zod. Forced tool_choice
// isn't used because current models reject it.

const FALLBACK_BETA = "server-side-fallback-2026-07-01";

function models() {
  return {
    default: process.env.AI_MODEL_DEFAULT || "claude-sonnet-5-5",
    fast: process.env.AI_MODEL_FAST || "claude-haiku-5-5",
  } satisfies Record<ModelTier, string>;
}

export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new AiError("not_configured", "ANTHROPIC_API_KEY is not set.");
    }
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 110_000 });
  }

  async structured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const model = models()[request.tier];
    // Server-side refusal fallback is available for the main model only.
    const useFallback = request.tier === "default";
    try {
      const response = await this.client.beta.messages.parse(
        {
          model,
          max_tokens: request.maxTokens,
          system: request.system,
          messages: [{ role: "user", content: request.prompt }],
          output_config: {
            format: betaZodOutputFormat(request.schema),
            effort: request.tier === "fast" ? "low" : "medium",
          },
          ...(useFallback ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
        },
        { signal: request.signal },
      );

      if (response.stop_reason === "refusal") {
        throw new AiError("refused", "The AI declined this request.");
      }
      if (response.stop_reason === "max_tokens") {
        throw new AiError("truncated", "The AI response was cut off.", true);
      }
      const usage: AiUsage = {
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
      if (response.parsed_output === null || response.parsed_output === undefined) {
        throw new AiError("invalid_output", "The AI response didn't match the expected format.", true);
      }
      return { data: response.parsed_output as T, usage };
    } catch (error) {
      throw toAiError(error);
    }
  }

  streamText(request: TextRequest): TextStream {
    const model = models()[request.tier];
    const stream = this.client.messages.stream(
      {
        model,
        max_tokens: request.maxTokens,
        system: request.system,
        messages: [{ role: "user", content: request.prompt }],
        output_config: { effort: "medium" },
      },
      { signal: request.signal },
    );

    const done = stream.finalMessage().then(
      (message) => {
        if (message.stop_reason === "refusal") throw new AiError("refused", "The AI declined this request.");
        return { model: message.model, inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens };
      },
      (error: unknown) => {
        throw toAiError(error);
      },
    );
    // Avoid unhandled rejections if the caller stops early.
    done.catch(() => undefined);

    async function* chunks() {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            yield event.delta.text;
          }
        }
      } catch (error) {
        throw toAiError(error);
      }
    }

    return { chunks: chunks(), done };
  }
}

function toAiError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof Anthropic.APIUserAbortError) return new AiError("aborted", "Cancelled.");
  if (error instanceof Anthropic.RateLimitError) return new AiError("rate_limited", "The AI service is busy.", true);
  if (error instanceof Anthropic.InternalServerError) return new AiError("overloaded", "The AI service had a problem.", true);
  if (error instanceof Anthropic.APIConnectionError) return new AiError("provider_error", "Couldn't reach the AI service.", true);
  if (error instanceof Anthropic.APIError) return new AiError("provider_error", `AI service error (${error.status ?? "unknown"}).`);
  if (error instanceof SyntaxError) return new AiError("invalid_output", "The AI response wasn't valid JSON.", true);
  return new AiError("provider_error", "Unexpected AI error.");
}
