import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { signInLinkFor, uniqueEmail } from "./mail";

/** Reads .env.local so tests can use the local Supabase keys. */
export function localEnv(): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(".env.local", "utf8")
        .split("\n")
        .filter((l) => /^[A-Z_]+=/.test(l))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
    );
  } catch {
    return {};
  }
}

/** Signs up a brand-new user through the real magic-link flow. */
export async function signUp(page: Page, prefix = "e2e"): Promise<string> {
  const email = uniqueEmail(prefix);
  await page.goto("/login?mode=signup");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await page.goto(await signInLinkFor(email));
  await page.waitForURL(/\/(onboarding|vault)/);
  return email;
}

/** Service-role REST call against the local Supabase (test setup only). */
export async function adminRest(path: string, init: RequestInit = {}) {
  const env = localEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Local Supabase env not found");
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", prefer: "return=representation", ...init.headers },
  });
  if (!response.ok) throw new Error(`Admin REST ${path} failed: ${response.status} ${await response.text()}`);
  return response.json();
}

export async function setPlan(email: string, plan: "free" | "pro") {
  await adminRest(`profiles?email=eq.${encodeURIComponent(email)}`, { method: "PATCH", body: JSON.stringify({ plan }) });
}

function adminKeys() {
  const env = localEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Local Supabase env not found");
  return { url, headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" } };
}

/** Files in the user's folder of the private resumes bucket. */
export async function storedFiles(userId: string): Promise<string[]> {
  const { url, headers } = adminKeys();
  const response = await fetch(`${url}/storage/v1/object/list/resumes`, {
    method: "POST",
    headers,
    body: JSON.stringify({ prefix: `${userId}/`, limit: 100 }),
  });
  if (!response.ok) throw new Error(`Storage list failed: ${response.status}`);
  return ((await response.json()) as { name: string }[]).map((f) => f.name);
}

/** HTTP status of the admin lookup for an auth user (404 once deleted). */
export async function authUserStatus(userId: string): Promise<number> {
  const { url, headers } = adminKeys();
  return (await fetch(`${url}/auth/v1/admin/users/${userId}`, { headers })).status;
}

export async function userIdFor(email: string): Promise<string> {
  const rows = (await adminRest(`profiles?email=eq.${encodeURIComponent(email)}&select=user_id`)) as { user_id: string }[];
  if (!rows[0]) throw new Error(`No profile for ${email}`);
  return rows[0].user_id;
}
