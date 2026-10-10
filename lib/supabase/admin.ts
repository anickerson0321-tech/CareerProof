import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { supabaseAdminEnv } from "@/lib/env.server";
import type { Database } from "./database.types";

/**
 * Service-role client. Bypasses Row Level Security, so only use it for work the
 * user can't do themselves (AI usage logging, billing, account deletion) and
 * always scope queries to the authenticated user's id.
 */
export function createAdminClient() {
  return createClient<Database>(publicEnv().NEXT_PUBLIC_SUPABASE_URL, supabaseAdminEnv().SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
