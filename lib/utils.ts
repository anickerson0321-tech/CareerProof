import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Only allow same-site relative redirect targets ("/vault"), never
 * "//evil.com" or "https://evil.com".
 */
export function safeNextPath(value: string | null | undefined, fallback = "/start"): string {
  if (!value || !value.startsWith("/") || value.length > 512) return fallback;
  // Browsers drop tabs and newlines in URLs and treat "\\" like "/", so
  // "/\t/evil.com" would become "//evil.com". Refuse both outright.
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
  // Resolve it the way a browser would and make sure it stays on this site.
  const base = "https://careerproof.invalid";
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    return fallback;
  }
  if (url.origin !== base) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}
