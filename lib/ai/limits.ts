import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Per-user protection for AI routes, counted from ai_calls in Postgres so it
// works on serverless (no in-memory state).

export const RATE_LIMITS = { perMinute: 10, perDay: 200 };

export type LimitProblem =
  | { code: "rate_minute"; message: string }
  | { code: "rate_day"; message: string }
  | { code: "cost_cap"; message: string };

export function monthlyCapUsd(): number {
  const value = Number(process.env.AI_MONTHLY_COST_CAP_USD);
  return Number.isFinite(value) && value > 0 ? value : 5;
}

export async function checkAiLimits(userId: string, now = new Date()): Promise<LimitProblem | null> {
  const admin = createAdminClient();
  const minuteAgo = new Date(now.getTime() - 60_000).toISOString();
  const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const [minute, day, month] = await Promise.all([
    admin.from("ai_calls").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", minuteAgo),
    admin.from("ai_calls").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", dayAgo),
    admin.from("ai_calls").select("cost_usd").eq("user_id", userId).gte("created_at", monthStart),
  ]);

  if ((minute.count ?? 0) >= RATE_LIMITS.perMinute) {
    return { code: "rate_minute", message: "You're going a bit fast. Wait a minute, then try again." };
  }
  if ((day.count ?? 0) >= RATE_LIMITS.perDay) {
    return { code: "rate_day", message: "You've reached today's limit for AI requests. It resets within 24 hours." };
  }
  const spent = (month.data ?? []).reduce((sum, row) => sum + Number(row.cost_usd ?? 0), 0);
  if (spent >= monthlyCapUsd()) {
    return {
      code: "cost_cap",
      message:
        "You've reached this month's fair-use limit for AI processing. It resets on the 1st. If you need more, contact us.",
    };
  }
  return null;
}
