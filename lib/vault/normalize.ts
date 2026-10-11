/**
 * Text used to recognize the same fact or job across imports: lowercase, no
 * punctuation, single spaces, "&" as "and". "Led a team of 5." and
 * "led a team of 5" match; different numbers never do.
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9%+#.]+/g, " ")
    .replace(/(?<!\d)\.|\.(?!\d)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Employer + title identity for matching jobs between resumes. */
export function jobIdentity(employer: string, title: string): string {
  const employerKey = normalizeText(employer)
    .replace(/\b(inc|llc|ltd|co|corp|corporation|company|the)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return `${employerKey}|${normalizeText(title)}`;
}
