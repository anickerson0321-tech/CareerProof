import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { AnthropicProvider } from "@/lib/ai/anthropic";
import { AiError } from "@/lib/ai/provider";

// The provider checks why the model stopped before reading its output, and
// validates the JSON itself, so each failure gets the right code and usage.

const schema = z.object({ a: z.number() });
const request = { task: "extract_resume" as const, tier: "default" as const, system: "s", prompt: "p", maxTokens: 100, fixtureKey: "k", schema };

function providerReturning(message: object) {
  const provider = new AnthropicProvider();
  (provider as unknown as { client: unknown }).client = { beta: { messages: { create: async () => message } } };
  return provider;
}

function reply(text: string, stop_reason = "end_turn") {
  return { model: "claude-sonnet-5-5", stop_reason, content: [{ type: "text", text }], usage: { input_tokens: 10, output_tokens: 20 } };
}

async function failure(message: object) {
  try {
    await providerReturning(message).structured(request);
  } catch (error) {
    return error as AiError;
  }
  throw new Error("expected a failure");
}

beforeAll(() => {
  process.env.ANTHROPIC_API_KEY = "test-key";
});
afterAll(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("Anthropic structured output", () => {
  it("returns validated data with usage", async () => {
    const result = await providerReturning(reply('{"a":1}')).structured(request);
    expect(result).toEqual({ data: { a: 1 }, usage: { model: "claude-sonnet-5-5", inputTokens: 10, outputTokens: 20 } });
  });

  it("marks a schema mismatch as invalid output (retryable), with usage", async () => {
    const error = await failure(reply('{"a":"one"}'));
    expect(error).toBeInstanceOf(AiError);
    expect(error).toMatchObject({ code: "invalid_output", retryable: true, usage: { outputTokens: 20 } });
  });

  it("marks broken JSON as invalid output", async () => {
    expect(await failure(reply('{"a":'))).toMatchObject({ code: "invalid_output", retryable: true });
  });

  it("checks for a cut-off answer before parsing", async () => {
    expect(await failure(reply('{"a":', "max_tokens"))).toMatchObject({ code: "truncated", retryable: true, usage: { inputTokens: 10 } });
  });

  it("reports a refusal as a refusal", async () => {
    expect(await failure(reply("I can't help with that.", "refusal"))).toMatchObject({ code: "refused", retryable: false });
  });
});
