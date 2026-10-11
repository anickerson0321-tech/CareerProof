// Pure prompt-cache arithmetic for Cache Tax (no `$`, so tests run it directly).
// Multipliers are Anthropic's published prompt-caching ratios against the base
// input price: a 5-minute cache write costs 1.25x, a 1-hour write 2x, a read 0.1x.

export type Ttl = '5m' | '1h'

export const READ_MULTIPLIER = 0.1

export const ttlMs = (ttl: Ttl) => (ttl === '1h' ? 3_600_000 : 300_000)

export const writeMultiplier = (ttl: Ttl) => (ttl === '1h' ? 2 : 1.25)

/** How long before expiry a keep-alive ping fires. */
export const pingMarginMs = (ttl: Ttl) => (ttl === '1h' ? 300_000 : 60_000)

/** When the band starts warning, unless the user set their own window. */
export const defaultWarnMs = (ttl: Ttl) => (ttl === '1h' ? 600_000 : 120_000)

export type Estimate = {
  tokens: number
  /** How many times a warm read a lapsed cache costs (12.5x for 5m, 20x for 1h). */
  multiple: number
  /** Present only when a price per million input tokens is configured. */
  rewriteUsd?: number
  warmReadUsd?: number
}

export function estimate(tokens: number, ttl: Ttl, usdPerMTok: number): Estimate {
  const multiple = writeMultiplier(ttl) / READ_MULTIPLIER
  if (!(usdPerMTok > 0)) return { tokens, multiple }
  const base = (tokens / 1_000_000) * usdPerMTok
  return { tokens, multiple, rewriteUsd: base * writeMultiplier(ttl), warmReadUsd: base * READ_MULTIPLIER }
}

export type CacheStatus =
  | { kind: 'none' }
  | { kind: 'warm'; remainingMs: number; isWarning: boolean }
  | { kind: 'expired'; agoMs: number }

export function status(lastAt: number | null, now: number, ttl: Ttl, warnMs: number): CacheStatus {
  if (lastAt === null) return { kind: 'none' }
  const remainingMs = lastAt + ttlMs(ttl) - now
  if (remainingMs <= 0) return { kind: 'expired', agoMs: now - (lastAt + ttlMs(ttl)) }
  return { kind: 'warm', remainingMs, isWarning: remainingMs <= warnMs }
}

export const formatTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`

export function formatDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

export const formatUsd = (usd: number) => (usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`)

/** "30m", "2h", "90" (minutes), "1h30m"; null when it does not parse or is out of range. */
export function parseDuration(text: string): number | null {
  const t = text.trim().toLowerCase()
  if (/^\d+$/.test(t)) return Number(t) * 60_000
  const m = /^(?:(\d+)h)?\s*(?:(\d+)m)?$/.exec(t)
  if (m === null || (m[1] === undefined && m[2] === undefined)) return null
  return (Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60_000
}

/** Pings that cost as much as one re-write: past this, keeping warm costs more than letting it lapse. */
export const breakEvenPings = (ttl: Ttl) => Math.floor(writeMultiplier(ttl) / READ_MULTIPLIER)
