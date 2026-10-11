// US dollars per million tokens. Used for the per-user monthly safety cap and
// cost tracking. Update when prices change.
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

// Unknown models are priced like the main model so the cap stays conservative.
const FALLBACK_PRICE = PRICES["claude-sonnet-5-5"]!;

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const key = Object.keys(PRICES).find((name) => model.startsWith(name));
  const price = key ? PRICES[key]! : model === "mock" ? { input: 0, output: 0 } : FALLBACK_PRICE;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}
