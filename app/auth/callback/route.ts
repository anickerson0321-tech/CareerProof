import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/utils";

// Where the magic link and Google sign-in come back to. Exchanges the one-time
// code for a session cookie, then continues to `next` (same-site paths only).

const OTP_TYPES: EmailOtpType[] = ["magiclink", "email", "signup", "recovery", "invite", "email_change"];

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const providerError = searchParams.get("error_description") ?? searchParams.get("error");

  if (providerError) return failed(origin, next, "provider");

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
    return failed(origin, next, "expired");
  }

  if (tokenHash && type && (OTP_TYPES as string[]).includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType });
    if (!error) return NextResponse.redirect(new URL(next, origin));
    return failed(origin, next, "expired");
  }

  return failed(origin, next, "missing");
}

function failed(origin: string, next: string, reason: string) {
  const url = new URL("/login", origin);
  url.searchParams.set("error", reason);
  url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}
