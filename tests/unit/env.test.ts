import { afterEach, describe, expect, it } from "vitest";
import { appUrl, supabasePublicKey } from "@/lib/env";
import { supabaseAdminEnv } from "@/lib/env.server";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

function unset(...names: string[]) {
  for (const name of names) delete process.env[name];
}

describe("site address", () => {
  it("uses NEXT_PUBLIC_APP_URL when set", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://careerproof.example";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "careerproof.vercel.app";
    expect(appUrl()).toBe("https://careerproof.example");
  });

  it("falls back to the Vercel production domain", () => {
    unset("NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL");
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "careerproof.vercel.app";
    expect(appUrl()).toBe("https://careerproof.vercel.app");
  });

  it("defaults to localhost", () => {
    unset("NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_PROJECT_PRODUCTION_URL");
    expect(appUrl()).toBe("http://localhost:3000");
  });
});

describe("Supabase key names", () => {
  it("accepts the newer publishable and secret key names", () => {
    unset("NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY");
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_x";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_x";
    expect(supabasePublicKey()).toBe("sb_publishable_x");
    expect(supabaseAdminEnv().SUPABASE_SERVICE_ROLE_KEY).toBe("sb_secret_x");
  });

  it("prefers the classic names when both are set", () => {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_x";
    expect(supabasePublicKey()).toBe("anon");
  });

  it("explains a missing server key", () => {
    unset("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY");
    expect(() => supabaseAdminEnv()).toThrow(/SUPABASE_SERVICE_ROLE_KEY \(or SUPABASE_SECRET_KEY\)/);
  });
});
