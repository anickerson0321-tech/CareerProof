// Pure feedback detection and CLAUDE.md editing for Reflect (no `$`).

export type FeedbackKind = 'prohibition' | 'correction' | 'preference'

const SENTENCE_START = String.raw`(?:^|[.!?\n]\s*)`
const PLEASE = String.raw`(?:(?:no|nope)[,.!]?\s+)?(?:please\s+|pls\s+|ok(?:ay)?,?\s+|but\s+)?`

const PATTERNS: readonly [FeedbackKind, RegExp][] = [
  ['prohibition', new RegExp(`${SENTENCE_START}${PLEASE}(?:don'?t|do not|never|stop \\w+ing|quit \\w+ing|no more|avoid)\\b`, 'i')],
  ['correction', new RegExp(`${SENTENCE_START}${PLEASE}(?:no|nope|wrong|that'?s (?:not|wrong|incorrect)|not like that|you (?:shouldn'?t|should not|forgot|missed)|i (?:said|told you|meant|asked)|why did you|that is not what)\\b`, 'i')],
  ['preference', new RegExp(`\\b(?:i(?:'d| would)? prefer|prefer\\b|instead(?: of)?\\b|rather than|from now on|going forward|in the future|always use|use \\S+(?: \\S+)? instead)`, 'i')],
]

/** Replies that start with "no" but carry no correction. */
const BENIGN = /^\s*(?:no (?:problem|worries|rush|need|thanks?)|nope,? (?:that'?s|all) (?:it|good|fine)|thanks|thank you|great|perfect|looks good|lgtm)\b/i

export function detectFeedback(text: string): FeedbackKind | null {
  const t = text.trim()
  if (t.length === 0 || t.length > 800 || t.startsWith('/') || BENIGN.test(t)) return null
  for (const [kind, re] of PATTERNS) if (re.test(t)) return kind
  return null
}

/** A plain draft when no model is available: the feedback's first sentence, tidied. */
export function draftRuleLocally(text: string): string {
  let t = text.trim().replace(/\s+/g, ' ')
  t = t.replace(/^(?:no|nope|wrong|actually|ugh|hmm)[,.!:;\s-]+/i, '')
  t = t.replace(/^(?:please|pls)\s+/i, '')
  const first = /^(.{8,220}?[.!?])(\s|$)/.exec(t)?.[1] ?? t.slice(0, 220)
  const rule = first.replace(/[!]+$/, '.')
  return rule.charAt(0).toUpperCase() + rule.slice(1)
}

/** Cleans a model's draft: one line, no bullet or quotes; null for NONE. */
export function cleanDraft(reply: string): string | null {
  const line = reply.trim().split('\n').find(l => l.trim().length > 0)?.trim() ?? ''
  const t = line.replace(/^[-*•]\s*/, '').replace(/^(?:rule:\s*)/i, '').replace(/^["“'`]+|["”'`]+$/g, '').trim()
  if (t.length === 0 || /^none\.?$/i.test(t)) return null
  return t.length > 300 ? `${t.slice(0, 297)}...` : t
}

export const SECTION = '## Rules learned from feedback'

const normal = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Adds `rule` as a bullet under SECTION, creating it at the end if needed. Null when already present. */
export function insertRule(existing: string, rule: string): string | null {
  const bullet = `- ${rule}`
  const lines = existing.split('\n')
  const has = lines.some(l => /^\s*[-*]\s+/.test(l) && normal(l.replace(/^\s*[-*]\s+/, '')) === normal(rule))
  if (has) return null
  const at = lines.findIndex(l => l.trim() === SECTION)
  if (at === -1) {
    const body = existing.replace(/\s*$/, '')
    return `${body}${body.length > 0 ? '\n\n' : ''}${SECTION}\n\n${bullet}\n`
  }
  let end = lines.length
  for (let i = at + 1; i < lines.length; i++) {
    if (/^#{1,2}\s/.test(lines[i]!)) {
      end = i
      break
    }
  }
  let insertAt = end
  while (insertAt > at + 1 && lines[insertAt - 1]!.trim() === '') insertAt--
  const out = [...lines.slice(0, insertAt), bullet, ...lines.slice(insertAt)]
  if (end < lines.length && out[insertAt + 1]?.trim() !== '') out.splice(insertAt + 1, 0, '')
  return out.join('\n')
}
