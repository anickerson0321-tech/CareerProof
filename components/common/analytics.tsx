import Script from "next/script";

// Privacy-friendly, cookie-free page analytics (Plausible or a compatible
// service). Off unless NEXT_PUBLIC_ANALYTICS_DOMAIN is set. Never sends
// resume, vault or posting content: only page views and named events.
export function Analytics() {
  const domain = process.env.NEXT_PUBLIC_ANALYTICS_DOMAIN?.trim();
  if (!domain) return null;
  const src = process.env.NEXT_PUBLIC_ANALYTICS_SRC?.trim() || "https://plausible.io/js/script.js";
  return <Script defer data-domain={domain} src={src} strategy="afterInteractive" />;
}
