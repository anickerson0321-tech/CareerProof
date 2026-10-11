import type { ModelTier } from "./provider";

/** Model ids for each tier, from env with the current defaults. */
export function modelFor(tier: ModelTier): string {
  return tier === "fast" ? process.env.AI_MODEL_FAST || "claude-haiku-5-5" : process.env.AI_MODEL_DEFAULT || "claude-sonnet-5-5";
}
