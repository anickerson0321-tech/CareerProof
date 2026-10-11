import type { Fact } from "@/lib/domain";
import { unsupportedNumbers } from "@/lib/guard/numbers";

// Cover-letter helpers shared by the browser and the server.

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

/** Non-blocking notes: numbers in the letter that none of the person's confirmed facts state. */
export function letterNumberNotes(text: string, facts: Fact[]): string[] {
  const sources = facts.filter((f) => f.status === "confirmed").map((f) => f.text);
  return unsupportedNumbers(text, sources).map(
    (n) => `"${n.raw}" doesn't appear in your confirmed facts. Check it's accurate before you send this letter.`,
  );
}

/** Marks a failure inside a letter stream that has already started. */
export const STREAM_ERROR_MARK = "\u0000ERROR:";
