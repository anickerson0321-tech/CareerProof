import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { modelFor } from "./models";
import { AiError, type AiProvider, type AiUsage, type StructuredRequest, type StructuredResult, type TextRequest, type TextStream } from "./provider";

// Anthropic implementation. JSON is forced with structured outputs
// (output_config.format), then validated again with Zod. Forced tool_choice
// isn't used because current models reject it.

const FALLBACK_BETA = "server-side-fallback-2026-07-01";


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
    const model = modelFor(request.tier);
    // Server-side refusal fallback is available for the main model only.
    const useFallback = request.tier === "default";
    let response;
    try {
      response = await this.client.beta.messages.create(
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
    } catch (error) {
      throw toAiError(error);
    }

    // Check why it stopped before reading the output, and validate the JSON
    // ourselves, so each failure gets the right code (and the retry it needs).
    const usage: AiUsage = {
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
    if (response.stop_reason === "refusal") {
      throw new AiError("refused", "The AI declined this request.", false, usage);
    }
    if (response.stop_reason === "max_tokens") {
      throw new AiError("truncated", "The AI response was cut off.", true, usage);
    }
    const text = response.content.map((block) => (block.type === "text" ? block.text : "")).join("");
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new AiError("invalid_output", "The AI response wasn't valid JSON.", true, usage);
    }
    const parsed = request.schema.safeParse(json);
    if (!parsed.success) {
      throw new AiError("invalid_output", "The AI response didn't match the expected format.", true, usage);
    }
    return { data: parsed.data, usage };
  }

  streamText(request: TextRequest): TextStream {
    const model = modelFor(request.tier);
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
        // Bill what was streamed before a cancel or failure, if we know it.
        const partial = stream.currentMessage;
        const usage = partial
          ? { model: partial.model, inputTokens: partial.usage.input_tokens, outputTokens: partial.usage.output_tokens }
          : null;
        const aiError = toAiError(error);
        throw usage ? new AiError(aiError.code, aiError.message, aiError.retryable, usage) : aiError;
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
  return new AiError("provider_error", "Unexpected AI error.");
}
