// Words that claim authority or ownership (SPEC §8). If a resume line uses one
// and none of the facts it cites do, the line needs a look.

const AUTHORITY_PATTERN =
  /\b(led|lead\w*|manag\w*|supervis\w*|direct\w*|administ\w*|oversaw|oversee\w*|overseen|headed|owned|spearhead\w*|chair\w*)\b/gi;

export function authorityWords(text: string): string[] {
  return [...text.matchAll(AUTHORITY_PATTERN)].map((m) => m[0].toLowerCase());
}

export function hasAuthorityWord(text: string): boolean {
  return authorityWords(text).length > 0;
}
