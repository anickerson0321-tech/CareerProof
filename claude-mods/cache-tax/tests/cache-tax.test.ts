import { describe, expect, mock, test } from 'claude-code/testing'

import { breakEvenPings, estimate, formatDuration, formatTokens, parseDuration, status } from '../hooks/math'

describe('math', () => {
  test('reload estimates use the cache multipliers', async () => {
    expect(estimate(100_000, '1h', 0)).toEqual({ tokens: 100_000, multiple: 20 })
    expect(estimate(100_000, '5m', 0).multiple).toBe(12.5)
    const priced = estimate(1_000_000, '5m', 4)
    expect(Math.round((priced.rewriteUsd ?? 0) * 1000)).toBe(5000)
    expect(Math.round((priced.warmReadUsd ?? 0) * 1000)).toBe(400)
    expect(breakEvenPings('5m')).toBe(12)
    expect(breakEvenPings('1h')).toBe(20)
  })

  test('status counts down and flips to expired at the TTL', async () => {
    expect(status(null, 5, '5m', 60_000)).toEqual({ kind: 'none' })
    expect(status(0, 100_000, '5m', 60_000)).toEqual({ kind: 'warm', remainingMs: 200_000, isWarning: false })
    expect(status(0, 250_000, '5m', 60_000)).toEqual({ kind: 'warm', remainingMs: 50_000, isWarning: true })
    expect(status(0, 300_000, '5m', 60_000)).toEqual({ kind: 'expired', agoMs: 0 })
    expect(status(0, 3_700_000, '1h', 600_000)).toEqual({ kind: 'expired', agoMs: 100_000 })
  })

  test('formats and parses', async () => {
    expect(formatTokens(142_300)).toBe('142k')
    expect(formatTokens(1_250)).toBe('1.3k')
    expect(formatDuration(65_000)).toBe('1m 05s')
    expect(formatDuration(3_900_000)).toBe('1h 05m')
    expect(parseDuration('30m')).toBe(1_800_000)
    expect(parseDuration('1h30m')).toBe(5_400_000)
    expect(parseDuration('90')).toBe(5_400_000)
    expect(parseDuration('soon')).toBeNull()
  })
})

const USAGE = { input_tokens: 10, output_tokens: 90, cache_read_input_tokens: 99_000, cache_creation_input_tokens: 900, model: 'claude-test' }

describe('session', () => {
  test('/keepwarm refuses before any request and explains usage', async ($, on) => {
    mock.clock(on)
    const r = await $.command.run({ command: 'keepwarm', args: '' } as never)
    expect(r.text).toContain('send a message first')
  })

  test('band warns near expiry with the reload estimate, and keepwarm pings over the cache', async ($, on) => {
    const clock = mock.clock(on)
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    let forks = 0
    on('model.fork', () => {
      forks += 1
      return { value: { isAnswered: true as const, text: 'ok', usage: { input_tokens: 20, output_tokens: 1, cache_read_input_tokens: 100_000, cache_creation_input_tokens: 0 } } }
    })
    on('turn.step', async function* () {
      return { turnId: 't', index: 0, answer: 'hi', toolUses: [], stopReason: 'end_turn' as const, usage: USAGE }
    })
    await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
    for await (const _ of $.turn.step({ turnId: 't', index: 0, model: 'claude-test', messageCount: 1 })) void _

    await clock.advance(51 * 60_000)
    const ui = await $.ui.mount({ plugin: 'cache-tax', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 100 } as never })
    expect((await ui.find({ type: 'Text', text: /Cache expires in 9m/ }))).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /100k tokens re-written, 20x a warm read/ }))).toBeDefined()
    await ui.unmount()

    const started = await $.command.run({ command: 'keepwarm', args: '30m' } as never)
    expect(started.text).toContain('Keep-warm on for 30m')
    await clock.advance(5 * 60_000)
    expect(forks).toBe(1)
    const st = await $.command.run({ command: 'keepwarm', args: 'status' } as never)
    expect(st.text).toContain('1 ping(s)')
  })
})
