// Number extraction for Truth Guard. Commas are stripped ("1,200" → 1200) and
// percentages are kept distinct from plain numbers ("15%" ≠ "15").

export interface NumberToken {
  value: number;
  percent: boolean;
  raw: string;
}

const NUMBER_PATTERN = /(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(\s*(?:%|percent\b|per cent\b))?/gi;

export function extractNumbers(text: string): NumberToken[] {
  const tokens: NumberToken[] = [];
  for (const match of text.matchAll(NUMBER_PATTERN)) {
    const whole = (match[1] ?? "").replace(/,/g, "");
    const fraction = match[2] ?? "";
    const value = Number(whole + fraction);
    if (!Number.isFinite(value)) continue;
    tokens.push({ value, percent: Boolean(match[3]), raw: match[0].trim() });
  }
  return tokens;
}

/**
 * Numbers in `claim` that the sources don't state. A percentage needs the same
 * percentage in a source; a plain number is satisfied by the same value anywhere
 * in the sources.
 */
export function unsupportedNumbers(claim: string, sources: string[]): NumberToken[] {
  const sourceTokens = sources.flatMap(extractNumbers);
  const seen = new Set<string>();
  const missing: NumberToken[] = [];
  for (const token of extractNumbers(claim)) {
    const found = sourceTokens.some(
      (s) => s.value === token.value && (token.percent ? s.percent : true),
    );
    const key = `${token.value}${token.percent ? "%" : ""}`;
    if (!found && !seen.has(key)) {
      seen.add(key);
      missing.push(token);
    }
  }
  return missing;
}
