"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * False during server render and hydration, true once the page is interactive.
 * Used to keep buttons disabled until clicking them actually does something.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}
