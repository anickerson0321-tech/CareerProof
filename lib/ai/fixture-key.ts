import { createHash } from "node:crypto";

/**
 * A readable, exact key for recorded AI responses: a slug of the first line of
 * the input plus a short hash of all of it, e.g. "jordan-rivera-3fa2c1d0".
 */
export function fixtureKey(...parts: string[]): string {
  const joined = parts.join("\n---\n");
  const firstLine = joined.split("\n").find((l) => l.trim() !== "") ?? "input";
  const slug = firstLine
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "input";
  const hash = createHash("sha256").update(joined).digest("hex").slice(0, 8);
  return `${slug}-${hash}`;
}
