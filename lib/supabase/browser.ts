"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabasePublicKey } from "@/lib/env";
import type { Database } from "./database.types";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabasePublicKey()!,
  );
}
