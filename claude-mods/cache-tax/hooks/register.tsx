import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { KeepWarm, LastRequest } from '../types'
import {
  breakEvenPings,
  defaultWarnMs,
  estimate,
  formatDuration,
  formatTokens,
  formatUsd,
  parseDuration,
  pingMarginMs,
  status,
  ttlMs,
} from './math'
import type { Estimate, Ttl } from './math'

const last = atom({ plugin: 'cache-tax', key: 'last' } as const, null)
const keepWarm = atom({ plugin: 'cache-tax', key: 'keepWarm' } as const, null)
const isRunning = atom({ plugin: 'cache-tax', key: 'isRunning' } as const, false)
const isHidden = atom({ plugin: 'cache-tax', key: 'isHidden' } as const, false)
const tick = atom({ plugin: 'cache-tax', key: 'tick' } as const, 0)

const PING_PROMPT = 'Keep-alive ping from the Cache Tax plugin. Reply with exactly: ok'
const DEFAULT_KEEPWARM_MS = 60 * 60_000
const MAX_KEEPWARM_MS = 8 * 60 * 60_000

type Settings = { ttl: Ttl; usdPerMTok: number; warnMs: number }

function describeCost(est: Estimate) {
  const usd = est.rewriteUsd === undefined ? '' : ` (~${formatUsd(est.rewriteUsd)} vs ${formatUsd(est.warmReadUsd ?? 0)} warm)`
  return `~${formatTokens(est.tokens)} tokens re-written${usd}, ${est.multiple}x a warm read`
}

async function recordRequest($: EngineInterface, contextTokens: number, model: string) {
  const request: LastRequest = { at: await $.clock.now(), contextTokens, model }
  await update($, last, () => request)
  await update($, isHidden, () => false)
}

async function stopKeepWarm($: EngineInterface, reason: string) {
  await update($, keepWarm, kw => (kw === null ? null : { ...kw, until: 0, stoppedReason: reason }))
  $.ui.toast(`Cache Tax: keep-warm stopped. ${reason}`, { timeoutMs: 8000 })
}

async function ping($: EngineInterface, request: LastRequest) {
  const r = await $.model.fork({ prompt: PING_PROMPT })
  if (!r.isAnswered) {
    await stopKeepWarm($, `The ping failed (${r.reason}${r.reason === 'api-error' ? ` ${r.status ?? ''}` : ''}).`)
    return
  }
  const read_ = r.usage.cache_read_input_tokens
  if (read_ < request.contextTokens * 0.5) {
    // The ping paid to re-write the prefix: the cache had lapsed or the model changed.
    await stopKeepWarm($, `The ping read only ${formatTokens(read_)} of ~${formatTokens(request.contextTokens)} tokens from cache, so the cache had already lapsed. Stopped to avoid paying for more re-writes.`)
    return
  }
  const now = await $.clock.now()
  await update($, last, l => (l === null ? l : { ...l, at: now }))
  await update($, keepWarm, kw => (kw === null ? null : { ...kw, pings: kw.pings + 1, readTokens: kw.readTokens + read_, lastPingAt: now }))
}

async function onTick($: EngineInterface, settings: Settings) {
  const now = await $.clock.now()
  await update($, tick, () => now)
  const kw = await read($, keepWarm)
  if (kw === null || kw.until === 0) return
  if (now >= kw.until) {
    await stopKeepWarm($, `Its window ended after ${kw.pings} ping(s).`)
    return
  }
  const request = await read($, last)
  if (request === null || (await read($, isRunning))) return
  const idleMs = now - request.at
  if (idleMs >= ttlMinusMargin(settings.ttl)) {
    if (kw.pings >= breakEvenPings(settings.ttl)) {
      await stopKeepWarm($, `It reached ${kw.pings} pings, the point where pinging costs as much as one re-write.`)
      return
    }
    await ping($, request)
  }
}

function ttlMinusMargin(ttl: Ttl) {
  return ttlMs(ttl) - pingMarginMs(ttl)
}

async function startKeepWarm($: EngineInterface, settings: Settings, durationMs: number) {
  const now = await $.clock.now()
  const kw: KeepWarm = { until: now + durationMs, pings: 0, readTokens: 0, lastPingAt: null, stoppedReason: null }
  await update($, keepWarm, () => kw)
  const request = await read($, last)
  const every = formatDuration(ttlMinusMargin(settings.ttl))
  const perPing = request === null ? '' : ` Each ping reads ~${formatTokens(request.contextTokens)} cached tokens (0.1x the input price)${settings.usdPerMTok > 0 ? `, about ${formatUsd((request.contextTokens / 1e6) * settings.usdPerMTok * 0.1)}` : ''}.`
  return `Keep-warm on for ${formatDuration(durationMs)}: while you are idle, a minimal ping is sent after ${every} without activity.${perPing} It stops after ${breakEvenPings(settings.ttl)} pings (the cost of one re-write), if a ping misses the cache, or with /keepwarm off.`
}

export const register: Register = (on, options) => {
  const ttl: Ttl = options.ttl === '5m' ? '5m' : '1h'
  const usdPerMTok = Number(options.inputUsdPerMTok ?? 0)
  const warnMinutes = Number(options.warnMinutes ?? 0)
  const settings: Settings = { ttl, usdPerMTok, warnMs: warnMinutes > 0 ? warnMinutes * 60_000 : defaultWarnMs(ttl) }

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    if (e.agentId === undefined && result.usage !== null) {
      const u = result.usage
      await recordRequest($, u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens + u.output_tokens, u.model)
    }
    return result
  })

  on('turn.start', async ($, e, next) => {
    await update($, isRunning, () => true)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) await update($, isRunning, () => false)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.turnId === undefined && e.origin.kind !== 'plugin') {
      const request = await read($, last)
      const now = await $.clock.now()
      const s = status(request?.at ?? null, now, settings.ttl, settings.warnMs)
      if (request !== null && s.kind === 'expired') {
        $.ui.toast(`Cache Tax: the cache lapsed ${formatDuration(s.agoMs)} ago. This message pays ${describeCost(estimate(request.contextTokens, settings.ttl, settings.usdPerMTok))}.`, { timeoutMs: 8000 })
      }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'keepwarm',
      description: 'Cache Tax: keep the prompt cache warm with minimal background pings while idle',
      argumentHint: '[30m|2h|off|status]',
    })
    $.clock.every(15_000, () => {
      void onTick($, settings)
    })
    return next(e)
  })

  on('command.run', { command: 'keepwarm' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const kw = await read($, keepWarm)
    const request = await read($, last)
    const now = await $.clock.now()

    if (arg === 'off' || arg === 'stop') {
      if (kw === null || kw.until === 0) return { text: 'Keep-warm is not running.' }
      await update($, keepWarm, k => (k === null ? null : { ...k, until: 0, stoppedReason: 'Stopped with /keepwarm off.' }))
      return { text: `Keep-warm stopped after ${kw.pings} ping(s), ${formatTokens(kw.readTokens)} cached tokens read.` }
    }
    if (arg === 'status') {
      const s = status(request?.at ?? null, now, settings.ttl, settings.warnMs)
      const cache = s.kind === 'none' ? 'No request yet this session.' : s.kind === 'warm' ? `Cache warm for ${formatDuration(s.remainingMs)} more (TTL ${settings.ttl}).` : `Cache lapsed ${formatDuration(s.agoMs)} ago (TTL ${settings.ttl}).`
      const reload = request === null ? '' : ` If it lapses: ${describeCost(estimate(request.contextTokens, settings.ttl, settings.usdPerMTok))}.`
      const warm = kw === null ? 'Keep-warm has not run.' : kw.until > now ? `Keep-warm on for ${formatDuration(kw.until - now)} more, ${kw.pings} ping(s) so far.` : `Keep-warm off. ${kw.stoppedReason ?? ''}`
      return { text: `${cache}${reload}\n${warm}` }
    }
    if (request === null) return { text: 'Nothing is cached yet: send a message first, then /keepwarm.' }
    const s = status(request.at, now, settings.ttl, settings.warnMs)
    if (s.kind === 'expired') return { text: `The cache already lapsed ${formatDuration(s.agoMs)} ago, so a ping would pay the full re-write. Send your next message instead; /keepwarm afterwards keeps it warm.` }
    const durationMs = arg === '' ? DEFAULT_KEEPWARM_MS : parseDuration(arg)
    if (durationMs === null || durationMs <= 0) return { text: 'Usage: /keepwarm [30m|2h|90|off|status]. With no argument it runs for 1h.' }
    return { text: await startKeepWarm($, settings, Math.min(durationMs, MAX_KEEPWARM_MS)) }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || e.props.isWorking || (await read($, isHidden))) return next(e)
    const request = await read($, last)
    const kw = await read($, keepWarm)
    const now = await read($, tick)
    if (request === null || now === 0) return next(e)
    const s = status(request.at, now, settings.ttl, settings.warnMs)
    const isKeepWarmOn = kw !== null && kw.until > now
    if (s.kind === 'warm' && !s.isWarning && !isKeepWarmOn) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const cost = describeCost(estimate(request.contextTokens, settings.ttl, settings.usdPerMTok))
    const headline =
      s.kind === 'expired'
        ? `Cache lapsed ${formatDuration(s.agoMs)} ago. Your next message pays ${cost}.`
        : s.kind === 'warm'
          ? `Cache expires in ${formatDuration(s.remainingMs)}. If it lapses, your next message pays ${cost}.`
          : ''
    const kwLine = isKeepWarmOn ? `Keep-warm on: ${kw.pings} ping(s), ends in ${formatDuration(kw.until - now)}.` : ''

    return (
      <Box flexDirection="column">
        <Text color={s.kind === 'expired' ? 'error' : 'warning'} wrap="wrap">
          Cache Tax · {headline}
        </Text>
        <Box flexDirection="row" gap={1}>
          {kwLine !== '' && <Text dimColor>{kwLine}</Text>}
          {s.kind === 'warm' && !isKeepWarmOn && (
            <Button key="warm" label="Keep warm 1h" onPress={() => void startKeepWarm($, settings, DEFAULT_KEEPWARM_MS)} />
          )}
          {isKeepWarmOn && (
            <Button key="stop" label="Stop keep-warm" onPress={() => void update($, keepWarm, k => (k === null ? null : { ...k, until: 0, stoppedReason: 'Stopped from the banner.' }))} />
          )}
          <Button key="hide" label="Hide" role="dismiss" onPress={() => void update($, isHidden, () => true)} />
        </Box>
      </Box>
    )
  })
}
