"use client";

/** Names of the few product events we count. No properties carry personal data. */
export type AnalyticsEvent = "Resume imported" | "Application created" | "Resume written" | "Resume downloaded" | "Upgrade started";

declare global {
  interface Window {
    plausible?: (event: string) => void;
  }
}

/** Counts an event if analytics is on; does nothing otherwise. */
export function track(event: AnalyticsEvent) {
  try {
    window.plausible?.(event);
  } catch {
    // Analytics must never break the app.
  }
}
