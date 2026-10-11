import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const S = require('../src/scan.js')
const E = require('../src/engine.js')

const NOW = Date.parse('2026-10-11T10:00:00Z')
const KICK = Date.parse('2026-10-11T14:00:00Z') / 1000
const DAY = 86400

function apiFixture({ id, ts, home, away, ft = [2, 1], status = 'FT', league = 39, leagueName = 'Premier League', season = 2026 }) {
  return {
    fixture: { id, timestamp: ts, date: new Date(ts * 1000).toISOString(), status: { short: status } },
    league: { id: league, name: leagueName, season, country: 'England' },
    teams: { home: { id: home[0], name: home[1] }, away: { id: away[0], name: away[1] } },
    goals: { home: ft?.[0] ?? null, away: ft?.[1] ?? null },
    score: { fulltime: { home: ft?.[0] ?? null, away: ft?.[1] ?? null }, extratime: { home: null, away: null }, penalty: { home: null, away: null } },
  }
}

const ARS = [42, 'Arsenal']
const CHE = [49, 'Chelsea']
const history = (team, other) => Array.from({ length: 6 }, (_, i) => apiFixture({ id: 1000 + team[0] * 10 + i, ts: KICK - (i + 1) * 7 * DAY, home: team, away: other, ft: [2, 1] }))

function fakeFetch({ footballStatus = 200, oddsPrice = -500, extraFixtures = [], dayRemaining = '95' } = {}) {
  const calls = []
  const fetch = async (url, init) => {
    calls.push({ url, headers: init?.headers ?? {} })
    const u = new URL(url, 'http://relay.local')
    const p = u.pathname.replace(/^\/relay/, '')
    const json = (body, status = 200, headers = {}) => ({ status, ok: status < 400, headers: new Map(Object.entries(headers)), json: async () => body })
    if (p.includes('/football/fixtures/headtohead') || p === '/fixtures/headtohead') return json({ errors: [], response: history(ARS, CHE) }, 200, { 'x-ratelimit-requests-remaining': dayRemaining })
    if (p.endsWith('/fixtures')) {
      if (footballStatus !== 200 && u.searchParams.get('team')) return json({ message: 'Too many requests' }, footballStatus)
      if (u.searchParams.get('date')) {
        return json({ errors: [], response: [
          apiFixture({ id: 1, ts: KICK, home: ARS, away: CHE, ft: null, status: 'NS' }),
          apiFixture({ id: 2, ts: KICK, home: [7, 'Ajax'], away: [8, 'PSV'], ft: null, status: 'NS', league: 9999, leagueName: 'Unmapped League' }),
          apiFixture({ id: 3, ts: KICK - 8 * 3600, home: [5, 'Early'], away: [6, 'Bird'], ft: [1, 0], status: 'FT' }),
          ...extraFixtures,
        ] }, 200, { 'x-ratelimit-requests-remaining': dayRemaining, 'x-ratelimit-requests-limit': '100' })
      }
      const team = Number(u.searchParams.get('team'))
      return json({ errors: [], response: history(team === 42 ? ARS : CHE, team === 42 ? CHE : ARS) }, 200, { 'x-ratelimit-requests-remaining': dayRemaining })
    }
    if (p.endsWith('/v4/sports')) return json([{ key: 'soccer_epl', active: true }], 200, { 'x-requests-remaining': '480' })
    if (p.endsWith('/v4/sports/soccer_epl/events')) return json([{ id: 'ev1', home_team: 'Arsenal', away_team: 'Chelsea', commence_time: new Date(KICK * 1000).toISOString() }])
    if (p.endsWith('/events/ev1/odds')) return json({ id: 'ev1', bookmakers: [{ key: 'draftkings', title: 'DraftKings', last_update: new Date(NOW).toISOString(), markets: [{ key: 'alternate_totals', last_update: new Date(NOW).toISOString(), outcomes: [{ name: 'Over', point: 1.5, price: oddsPrice }] }] }] }, 200, { 'x-requests-remaining': '478', 'x-requests-last': '2' })
    return json({ message: 'unexpected ' + p }, 404)
  }
  return { fetch, calls }
}

const clientFor = (conn, fetch, log = []) => S.createClient(conn, { fetch, footballPerMinute: 1e6, onRequest: (e) => log.push(e), now: () => NOW })

describe('scan', () => {
  test('relay mode never sends keys and the scan screens a matched fixture end to end', async () => {
    const { fetch, calls } = fakeFetch()
    const results = []
    const client = clientFor({ mode: 'relay', relayBase: '/relay' }, fetch)
    const { summary } = await S.runScan({ client, date: '2026-10-11', timezone: 'America/New_York', bookmakerKey: 'draftkings', settings: {}, now: () => NOW, onResult: (r) => results.push(r) })
    assert.ok(calls.every((c) => !/apiKey|x-apisports-key/i.test(c.url + JSON.stringify(c.headers))))
    assert.equal(summary.fixturesTotal, 3)
    assert.equal(summary.fixturesUpcoming, 2)
    assert.deepEqual(summary.unmappedCompetitions.map((u) => u.name), ['Unmapped League'])
    assert.equal(results.length, 1)
    const evald = E.evaluateMatch(results[0], {}, NOW)
    assert.equal(evald.rules[3].american, -500)
    assert.equal(evald.rules[3].selection.market, 'alternate_totals')
    assert.equal(evald.verdict, 'pass')
    assert.equal(client.quota.football.dayRemaining, 95)
    assert.equal(client.quota.odds.remaining, 478)
  })

  test('direct mode sends keys to the providers but the request log never shows them', async () => {
    const { fetch, calls } = fakeFetch()
    const log = []
    const client = clientFor({ mode: 'direct', footballKey: 'FOOTBALL-SECRET', oddsKey: 'ODDS-SECRET' }, fetch, log)
    await S.runScan({ client, date: '2026-10-11', timezone: 'UTC', bookmakerKey: 'draftkings', settings: {}, now: () => NOW })
    assert.ok(calls.some((c) => c.headers['x-apisports-key'] === 'FOOTBALL-SECRET'))
    assert.ok(calls.some((c) => c.url.includes('apiKey=ODDS-SECRET')))
    assert.ok(!JSON.stringify(log).includes('SECRET'))
  })

  test('a quota error stops the scan and lists what was not scanned', async () => {
    const extra = [apiFixture({ id: 4, ts: KICK + 3600, home: [11, 'Leeds'], away: [12, 'Burnley'], ft: null, status: 'NS' })]
    const { fetch } = fakeFetch({ footballStatus: 429, extraFixtures: extra })
    const client = clientFor({ mode: 'relay' }, fetch)
    const { summary } = await S.runScan({ client, date: '2026-10-11', timezone: 'UTC', bookmakerKey: 'draftkings', settings: {}, now: () => NOW })
    assert.match(summary.stoppedReason, /Rate limit or quota/)
    assert.equal(summary.notScanned.length, 1)
    assert.ok(summary.failures.some((f) => f.kind === 'quota'))
  })

  test('prices are not fetched for a match that already fails rules 1-3', async () => {
    const { fetch, calls } = fakeFetch()
    const client = clientFor({ mode: 'relay' }, fetch)
    const results = []
    await S.runScan({ client, date: '2026-10-11', timezone: 'UTC', bookmakerKey: 'draftkings', settings: { seasonAvgThreshold: 5 }, now: () => NOW, onResult: (r) => results.push(r) })
    assert.ok(!calls.some((c) => c.url.includes('/odds?') && c.url.includes('/events/')))
    assert.match(results[0].oddsSkipped, /already fails/)
    assert.equal(E.evaluateMatch(results[0], { seasonAvgThreshold: 5 }, NOW).rules[3].status, 'skipped')
  })

  test('stopping mid-scan reports the stop', async () => {
    const { fetch } = fakeFetch()
    const controller = new AbortController()
    const client = clientFor({ mode: 'relay' }, async (url, init) => {
      if (url.includes('team=')) controller.abort()
      return fetch(url, init)
    })
    const { summary } = await S.runScan({ client, date: '2026-10-11', timezone: 'UTC', bookmakerKey: 'draftkings', settings: {}, signal: controller.signal, now: () => NOW })
    assert.equal(summary.stoppedReason, 'Stopped by you')
  })

  test('API-Football plan errors surface as failures, leaving rules unknown', async () => {
    const { fetch } = fakeFetch()
    const client = clientFor({ mode: 'relay' }, async (url, init) => {
      if (url.includes('season=')) return { status: 200, ok: true, headers: new Map(), json: async () => ({ errors: { plan: 'Free plans do not have access to this season.' }, response: [] }) }
      return fetch(url, init)
    })
    const results = []
    await S.runScan({ client, date: '2026-10-11', timezone: 'UTC', bookmakerKey: 'draftkings', settings: {}, now: () => NOW, onResult: (r) => results.push(r) })
    assert.match(results[0].errors[0].message, /Free plans/)
    assert.equal(E.evaluateMatch(results[0], {}, NOW).rules[0].status, 'unknown')
  })
})
