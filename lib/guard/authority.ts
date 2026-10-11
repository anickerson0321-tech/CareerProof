// Words that claim authority or ownership (SPEC §8). If a resume line uses one
// and none of the facts it cites back it up, the line needs a look.

const AUTHORITY_PATTERN =
  /\b(led|lead|leads|leading|leader\w*|manag(?:e|ed|es|ing)|supervis(?:e|ed|es|ing)|direct(?:ed|s|ing)|administer(?:ed|s|ing)?|oversaw|oversee\w*|overseen|headed|owned|spearhead\w*|chaired|chairing)\b/gi;

/**
 * Words that mention authority without saying the person had it: "reported to
 * the manager", "followed the supervisor's directions", "management training".
 * They don't back up a claim like "Managed…".
 */
const NOT_THE_PERSON = /^(manager|managers|management|supervisor|supervisors|supervision|director|directors|direction|directions|administration|leadership)$/;

/** Authority words a line uses (claims to check). */
export function authorityWords(text: string): string[] {
  return [...text.matchAll(AUTHORITY_PATTERN)].map((m) => m[0].toLowerCase());
}

export function hasAuthorityWord(text: string): boolean {
  return authorityWords(text).length > 0;
}

/** True if the fact says the person themselves led, managed, supervised… something. */
export function backsAuthority(factText: string): boolean {
  return authorityWords(factText).some((word) => !NOT_THE_PERSON.test(word));
}
