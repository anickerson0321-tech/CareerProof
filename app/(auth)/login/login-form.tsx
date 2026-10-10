"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CircleAlert, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/browser";
import { safeNextPath } from "@/lib/utils";

const ERRORS: Record<string, string> = {
  expired: "That sign-in link has expired or was already used. Enter your email to get a new one.",
  provider: "Google sign-in didn't finish. Try again, or use your email instead.",
  missing: "That sign-in link wasn't complete. Enter your email to get a new one.",
};

const RESEND_SECONDS = 60;

export function LoginForm() {
  const params = useSearchParams();
  const signup = params.get("mode") === "signup";
  const next = safeNextPath(params.get("next"));
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(ERRORS[params.get("error") ?? ""] ?? null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const callbackUrl = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function sendLink(event?: React.FormEvent) {
    event?.preventDefault();
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError("Enter your full email address, like name@example.com.");
      return;
    }
    setError(null);
    setStatus("sending");
    const { error: sendError } = await createClient().auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: callbackUrl(), shouldCreateUser: true },
    });
    if (sendError) {
      setStatus("idle");
      setError(
        sendError.status === 429
          ? "You've asked for several links in a row. Wait a minute, then try again."
          : "We couldn't send the email just now. Check the address and try again.",
      );
      return;
    }
    setStatus("sent");
    setCooldown(RESEND_SECONDS);
  }

  async function signInWithGoogle() {
    setError(null);
    const { error: oauthError } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    if (oauthError) setError("Google sign-in isn't available right now. Use your email instead.");
  }

  if (status === "sent") {
    return (
      <div role="status" aria-live="polite">
        <MailCheck className="size-10 text-primary" aria-hidden />
        <h1 className="mt-3 text-2xl font-bold">Check your email</h1>
        <p className="mt-2">
          We sent a sign-in link to <strong className="break-all">{email.trim()}</strong>. Open it on this device to continue.
        </p>
        <p className="mt-2 text-sm text-fg-muted">The link works once and expires in an hour. Don&apos;t see it? Check your spam folder.</p>
        <div className="mt-6 flex flex-col gap-2">
          <Button variant="secondary" disabled={cooldown > 0} onClick={() => sendLink()}>
            {cooldown > 0 ? `Send again in ${cooldown}s` : "Send the link again"}
          </Button>
          <Button variant="ghost" onClick={() => setStatus("idle")}>
            Use a different email
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">{signup ? "Create your free account" : "Sign in to CareerProof"}</h1>
      <p className="mt-2 text-fg-muted">
        {signup ? "No password needed. We'll email you a link." : "No password needed. We'll email you a sign-in link."}
      </p>

      {error && (
        <p role="alert" className="mt-4 flex gap-2 rounded-lg bg-danger-tint p-3 text-sm font-semibold text-danger">
          <CircleAlert className="size-5 shrink-0" aria-hidden /> {error}
        </p>
      )}

      <form onSubmit={sendLink} className="mt-6 flex flex-col gap-3" noValidate>
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? true : undefined}
          required
        />
        <Button type="submit" size="lg" disabled={status === "sending"}>
          {status === "sending" ? "Sending…" : "Email me a sign-in link"}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3 text-sm text-fg-muted" aria-hidden>
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>

      <Button variant="secondary" size="lg" className="w-full" onClick={signInWithGoogle}>
        <GoogleIcon /> Continue with Google
      </Button>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h6c-.3 1.4-1 2.5-2.2 3.3v2.8h3.6c2.1-1.9 3.2-4.8 3.2-8.1z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.6H2.1v2.9C3.9 20.5 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.8 14c-.2-.7-.4-1.3-.4-2s.1-1.4.4-2V7.1H2.1C1.4 8.6 1 10.2 1 12s.4 3.4 1.1 4.9L5.8 14z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2C17.5 2.1 15 1 12 1 7.7 1 3.9 3.5 2.1 7.1L5.8 10c.9-2.7 3.3-4.6 6.2-4.6z" />
    </svg>
  );
}
