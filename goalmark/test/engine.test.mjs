import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const E = require('../src/engine.js')

// Fixture builder: regulation score via ft*, optional extra time.
let nextId = 1
function fx({ home = 1, away = 2, ts = 1_700_000_000, ft = [1, 1], goals, status = 'FT', league = 39, season = 2026, homeName, awayName } = {}) {
  return {
    id: nextId++, ts, date: new Date(ts * 1000).toISOString(), status, leagueId: league, leagueName: 'Premier League', season,
    homeId: home, homeName: homeName ?? `Team ${home}`, awayId: away, awayName: awayName ?? `Team ${away}`,
    ftHome: ft === null ? null : ft[0], ftAway: ft === null ? null : ft[1],
    goalsHome: goals ? goals[0] : ft?.[0], goalsAway: goals ? goals[1] : ft?.[1],
  }
}
const DAY = 86_400
const KICKOFF = 1_760_000_000

describe('odds conversion', () => {
  test('american and decimal convert both ways', () => {
    assert.equal(E.americanToDecimal(-200), 1.5)
    assert.equal(E.americanToDecimal(150), 2.5)
    assert.equal(E.decimalToAmerican(1.5), -200)
    assert.equal(E.decimalToAmerican(2.5), 150)
    assert.equal(E.americanToDecimal(50), null)
    assert.equal(E.decimalToAmerican(1), null)
  })

  test('implied probability is exact, not rounded', () => {
    assert.equal(E.impliedProbability(-670), 670 / 770)
    assert.ok(Math.abs(E.impliedProbability(-670) - 0.8701298701) < 1e-9)
    assert.equal(E.impliedProbability(100), 0.5)
    assert.equal(E.impliedProbability(-99), null)
  })

  test('break-even price at 87% is about -669.23, so -670 is slightly worse', () => {
    const be = E.breakEvenAmerican(0.87)
    assert.ok(Math.abs(be - -669.2307692) < 1e-6)
    const ev = E.expectedReturn(-670, 0.87)
    assert.ok(ev < 0 && ev > -0.0002, `EV at -670 should be just below zero, got ${ev}`)
    assert.ok(E.expectedReturn(-669, 0.87) > 0)
    assert.ok(Math.abs(E.expectedReturn(be, 0.87)) < 1e-12)
  })
})

describe('regulation time', () => {
  test('uses the 90-minute score and ignores extra time and penalties', () => {
    const aet = fx({ status: 'AET', ft: [1, 1], goals: [2, 1] })
    assert.deepEqual(E.regulationScore(aet), { home: 1, away: 1 })
    const pen = fx({ status: 'PEN', ft: [0, 0], goals: [0, 0] })
    assert.deepEqual(E.regulationScore(pen), { home: 0, away: 0 })
  })

  test('missing regulation scores are unknown unless the match ended in 90 minutes', () => {
    assert.equal(E.regulationScore(fx({ status: 'AET', ft: null, goals: [2, 1] })), null)
    assert.deepEqual(E.regulationScore(fx({ status: 'FT', ft: null, goals: [2, 1] })), { home: 2, away: 1 })
    assert.equal(E.regulationScore(fx({ status: 'NS', ft: null })), null)
    assert.equal(E.regulationScore(fx({ status: 'ABD', ft: [1, 0] })), null)
  })

  test('the historical cutoff drops matches at or after kickoff and unfinished ones', () => {
    const list = [fx({ ts: KICKOFF - DAY }), fx({ ts: KICKOFF }), fx({ ts: KICKOFF + DAY }), fx({ ts: KICKOFF - 2 * DAY, status: 'PST' })]
    const kept = E.completedBefore(list, KICKOFF)
    assert.equal(kept.length, 1)
    assert.equal(kept[0].ts, KICKOFF - DAY)
  })
})

describe('rule 1: season averages', () => {
  const season = (teamId, goalsPerGame, n) => Array.from({ length: n }, (_, i) => fx({ home: teamId, away: 50 + i, ts: KICKOFF - (i + 1) * DAY, ft: [goalsPerGame[i % goalsPerGame.length], 0] }))
  const opts = { cutoffSec: KICKOFF, leagueId: 39, leagueName: 'Premier League', season: 2026 }

  test('exactly 1.0 passes and just below fails', () => {
    const a = E.seasonAverage(1, 'A', season(1, [1], 6), opts)
    const b = E.seasonAverage(2, 'B', season(2, [2, 1, 1, 0, 1, 1], 6), opts)
    assert.equal(a.average, 1)
    assert.equal(b.goals, 6)
    assert.equal(E.evalRule1(a, b).status, 'pass')
    const low = E.seasonAverage(3, 'C', season(3, [1, 1, 1, 1, 1, 0], 6), opts)
    assert.ok(low.average < 1)
    const r = E.evalRule1(a, low)
    assert.equal(r.status, 'fail')
    assert.match(r.reasons.join(' '), /C averages 0\.83/)
  })

  test('other competitions, other seasons and later matches are excluded', () => {
    const list = [...season(1, [3], 3), fx({ home: 1, ts: KICKOFF - DAY, league: 2, ft: [0, 0] }), fx({ home: 1, ts: KICKOFF - DAY, season: 2025, ft: [0, 0] }), fx({ home: 1, ts: KICKOFF + DAY, ft: [0, 0] })]
    const s = E.seasonAverage(1, 'A', list, opts)
    assert.equal(s.played, 3)
    assert.equal(s.average, 3)
    assert.equal(s.competition, 'Premier League 2026/27')
  })

  test('too few matches or missing data is unknown, never a pass', () => {
    const one = E.seasonAverage(1, 'A', season(1, [4], 1), opts)
    assert.equal(E.evalRule1(one, one).status, 'unknown')
    assert.equal(E.evalRule1(null, one).status, 'unknown')
    const fail = E.seasonAverage(2, 'B', season(2, [0], 5), opts)
    assert.equal(E.evalRule1(null, fail).status, 'fail')
  })
})

describe('rule 2: head-to-head', () => {
  const meetings = (totals) => totals.map((t, i) => fx({ home: i % 2 ? 1 : 2, away: i % 2 ? 2 : 1, ts: KICKOFF - (i + 1) * 30 * DAY, ft: t === null ? null : [t, 0], status: t === null ? 'AET' : 'FT', goals: t === null ? [3, 2] : undefined }))

  test('needs MORE than 80%: 8 of 10 fails, 9 of 10 passes', () => {
    assert.equal(E.evalRule2(meetings([2, 2, 2, 2, 2, 2, 2, 2, 1, 0]), 1, 2, KICKOFF).status, 'fail')
    const r = E.evalRule2(meetings([2, 3, 2, 2, 4, 2, 2, 2, 2, 1]), 1, 2, KICKOFF)
    assert.equal(r.status, 'pass')
    assert.equal(r.qualifying, 9)
    assert.equal(r.sample, 10)
    assert.equal(r.pct, 90)
  })

  test('the window takes the latest meetings only', () => {
    const r = E.evalRule2(meetings([2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 0, 0]), 1, 2, KICKOFF, { h2hWindow: 10 })
    assert.equal(r.sample, 10)
    assert.equal(r.status, 'pass')
  })

  test('below the minimum sample is unknown; 4 of 5 (80%) fails at the minimum', () => {
    assert.equal(E.evalRule2(meetings([2, 2, 2, 2]), 1, 2, KICKOFF).status, 'unknown')
    assert.equal(E.evalRule2(meetings([2, 2, 2, 2, 1]), 1, 2, KICKOFF).status, 'fail')
    assert.equal(E.evalRule2(meetings([2, 2, 2, 2, 2]), 1, 2, KICKOFF).status, 'pass')
    assert.equal(E.evalRule2(meetings([2, 2, 2]), 1, 2, KICKOFF, { h2hMinSample: 3 }).status, 'pass')
    assert.equal(E.evalRule2(undefined, 1, 2, KICKOFF).status, 'unknown')
  })

  test('extra-time-only scores are excluded and counted against the sample', () => {
    const r = E.evalRule2(meetings([2, 2, 2, 2, null]), 1, 2, KICKOFF)
    assert.equal(r.sample, 4)
    assert.equal(r.status, 'unknown')
    assert.match(r.reasons.join(' '), /1 meeting\(s\) excluded/)
  })

  test('regulation goals decide: 1-1 after 90 is over, 1-0 then 2-0 in extra time is not', () => {
    const list = [fx({ home: 1, away: 2, ts: KICKOFF - DAY, status: 'AET', ft: [1, 0], goals: [2, 0] })]
    const r = E.evalRule2(list, 1, 2, KICKOFF, { h2hMinSample: 1 })
    assert.equal(r.meetings[0].total, 1)
    assert.equal(r.status, 'fail')
  })
})

describe('rule 3: recent scoring form', () => {
  const recent = (teamGoals) => teamGoals.map((g, i) => fx({ home: 1, away: 90 + i, ts: KICKOFF - (i + 1) * 4 * DAY, ft: g === null ? null : [g, 3], status: g === null ? 'AET' : 'FT', goals: g === null ? [1, 1] : undefined }))

  test('4 of 5 passes, 3 of 5 fails; it counts the team scoring, not both teams', () => {
    const pass = E.recentForm(1, 'A', recent([1, 0, 2, 1, 1]), KICKOFF)
    assert.equal(pass.scoredIn, 4)
    const fail = E.recentForm(1, 'A', recent([1, 0, 0, 1, 1]), KICKOFF)
    assert.equal(E.evalRule3(pass, pass).status, 'pass')
    assert.equal(E.evalRule3(pass, fail).status, 'fail')
    const opponentsScoredOnly = E.recentForm(1, 'A', recent([0, 0, 0, 0, 0]), KICKOFF)
    assert.equal(opponentsScoredOnly.scoredIn, 0)
  })

  test('only the last five before kickoff are used, across competitions', () => {
    const list = [...recent([1, 1, 1, 1, 1, 0, 0]), fx({ home: 1, away: 7, ts: KICKOFF + DAY, ft: [0, 0] }), fx({ home: 1, away: 8, ts: KICKOFF - DAY / 2, ft: [0, 1], league: 2 })]
    const f = E.recentForm(1, 'A', list, KICKOFF)
    assert.equal(f.rows.length, 5)
    assert.equal(f.rows[0].competition, 'Premier League')
    assert.equal(f.rows[0].scored, false)
    assert.equal(f.scoredIn, 4)
  })

  test('missing results make it unknown unless two blanks already fail it', () => {
    const gap = E.recentForm(1, 'A', recent([1, null, 1, 1, 1]), KICKOFF)
    assert.equal(E.evalRule3(gap, gap).status, 'unknown')
    const doomed = E.recentForm(1, 'A', recent([0, null, 0, 1, 1]), KICKOFF)
    assert.equal(E.evalRule3(doomed, gap).status, 'fail')
    const short = E.recentForm(1, 'A', recent([1, 1, 1]), KICKOFF)
    assert.equal(E.evalRule3(short, short).status, 'unknown')
    assert.equal(E.evalRule3(null, short).status, 'unknown')
  })
})

describe('rule 4: exact market selection and price', () => {
  const event = (markets, key = 'draftkings', lastUpdate = '2026-10-11T12:00:00Z') => ({
    id: 'e1', commence_time: '2026-10-11T15:00:00Z', home_team: 'A', away_team: 'B',
    bookmakers: [{ key, title: key === 'draftkings' ? 'DraftKings' : 'Caesars', last_update: lastUpdate, markets }],
  })
  const NOW = Date.parse('2026-10-11T12:10:00Z')

  test('picks Over 1.5 from alternate totals, ignoring halves and team totals', () => {
    const ev = event([
      { key: 'totals', last_update: '2026-10-11T12:00:00Z', outcomes: [{ name: 'Over', price: -150, point: 2.5 }, { name: 'Under', price: 120, point: 2.5 }] },
      { key: 'totals_h1', outcomes: [{ name: 'Over', price: -900, point: 1.5 }] },
      { key: 'alternate_team_totals', outcomes: [{ name: 'Over', description: 'A', price: -400, point: 1.5 }] },
      { key: 'alternate_totals', last_update: '2026-10-11T12:01:00Z', outcomes: [{ name: 'Over', price: -600, point: 1.5 }, { name: 'Under', price: 425, point: 1.5 }, { name: 'Over', price: -2000, point: 0.5 }] },
    ])
    const s = E.selectOver15(ev, 'draftkings')
    assert.equal(s.found, true)
    assert.equal(s.market, 'alternate_totals')
    assert.equal(s.american, -600)
  })

  test('never substitutes another line or bookmaker', () => {
    const ev = event([{ key: 'totals', outcomes: [{ name: 'Over', price: -150, point: 2.5 }, { name: 'Over', price: -300, point: 1.75 }] }])
    const s = E.selectOver15(ev, 'draftkings')
    assert.equal(s.found, false)
    assert.match(s.reason, /lines offered: 1.75, 2.5/)
    assert.equal(E.selectOver15(ev, 'williamhill_us').found, false)
  })

  test('the default rule passes only with positive expected return at the assumed probability', () => {
    const sel = (american) => ({ found: true, bookmaker: 'DraftKings', market: 'totals', point: 1.5, american, lastUpdate: '2026-10-11T12:00:00Z' })
    assert.equal(E.evalRule4(sel(-670), {}, NOW).status, 'fail')
    assert.equal(E.evalRule4(sel(-669), {}, NOW).status, 'pass')
    assert.equal(E.evalRule4(sel(-400), { assumedWinProb: 0.8 }, NOW).status, 'fail') // exactly break-even
    assert.equal(E.evalRule4(sel(-399), { assumedWinProb: 0.8 }, NOW).status, 'pass')
    const r = E.evalRule4(sel(-600), { assumedWinProb: 0.9 }, NOW)
    assert.equal(r.label, 'assuming a 90% win probability')
    assert.ok(Math.abs(r.expectedReturn - (0.9 * (100 / 600) - 0.1)) < 1e-12)
  })

  test('the cutoff rule uses the presenter\'s -670 inclusively', () => {
    const sel = (american) => ({ found: true, american, lastUpdate: '2026-10-11T12:00:00Z' })
    assert.equal(E.evalRule4(sel(-670), { priceRule: 'cutoff' }, NOW).status, 'pass')
    assert.equal(E.evalRule4(sel(-671), { priceRule: 'cutoff' }, NOW).status, 'fail')
    assert.equal(E.evalRule4(sel(-671), { priceRule: 'cutoff' }, NOW).meetsPresenterCutoff, false)
  })

  test('stale or missing prices are unknown', () => {
    const old = { found: true, american: -500, lastUpdate: '2026-10-11T10:00:00Z' }
    assert.equal(E.evalRule4(old, {}, NOW).status, 'unknown')
    assert.equal(E.evalRule4({ found: true, american: -500, lastUpdate: '2026-10-11T12:05:00Z' }, {}, NOW, NOW - 45 * 60_000).status, 'unknown')
    assert.equal(E.evalRule4(null, {}, NOW).status, 'unknown')
    assert.equal(E.evalRule4({ found: false, reason: 'x' }, {}, NOW).status, 'unknown')
  })

  test('decimal prices from the feed are converted', () => {
    const ev = event([{ key: 'totals', outcomes: [{ name: 'Over', price: 1.15, point: 1.5 }] }])
    assert.ok(Math.abs(E.selectOver15(ev, 'draftkings').american - -666.6667) < 1e-3)
  })
})

describe('verdicts and matching', () => {
  test('any fail fails; all pass passes; otherwise needs more data', () => {
    assert.equal(E.overallVerdict([{ status: 'pass' }, { status: 'unknown' }, { status: 'fail' }]), 'fail')
    assert.equal(E.overallVerdict([{ status: 'pass' }, { status: 'pass' }]), 'pass')
    assert.equal(E.overallVerdict([{ status: 'pass' }, { status: 'skipped' }]), 'unknown')
  })

  test('evaluateMatch with no evidence is needs-more-data', () => {
    const r = E.evaluateMatch({ fixture: fx({ status: 'NS', ts: KICKOFF, ft: null }) }, {}, KICKOFF * 1000)
    assert.equal(r.verdict, 'unknown')
    assert.ok(r.rules.every((x) => x.status === 'unknown'))
  })

  test('team names normalize across providers', () => {
    assert.equal(E.nameSimilarity('Manchester United', 'Man Utd'), 1)
    assert.equal(E.nameSimilarity('Wolverhampton Wanderers', 'Wolves'), 1)
    assert.equal(E.nameSimilarity('Brighton & Hove Albion', 'Brighton and Hove Albion'), 1)
    assert.ok(E.nameSimilarity('Atlético Madrid', 'Atletico Madrid') === 1)
    assert.ok(E.nameSimilarity('Arsenal', 'Aston Villa') < 0.5)
  })

  test('matches by names and kickoff; refuses to guess otherwise', () => {
    const fixture = { homeName: 'Manchester United', awayName: 'Wolverhampton Wanderers', ts: Date.parse('2026-10-11T14:00:00Z') / 1000 }
    const ev = (home, away, time = '2026-10-11T14:00:00Z', id = home + away) => ({ id, home_team: home, away_team: away, commence_time: time })
    assert.equal(E.matchEvent(fixture, [ev('Manchester United', 'Wolverhampton Wanderers'), ev('Arsenal', 'Chelsea')]).status, 'matched')
    assert.equal(E.matchEvent(fixture, [ev('Man Utd', 'Wolves')]).status, 'matched')
    assert.equal(E.matchEvent(fixture, [ev('Wolverhampton Wanderers', 'Manchester United')]).status, 'ambiguous')
    assert.equal(E.matchEvent(fixture, [ev('Manchester United', 'Wolverhampton Wanderers', '2026-10-11T19:00:00Z')]).status, 'unmatched')
    assert.equal(E.matchEvent(fixture, [ev('Manchester United', 'Wolverhampton Wanderers', undefined, 'a'), ev('Manchester United', 'Wolverhampton Wanderers', undefined, 'b')]).status, 'ambiguous')
    assert.equal(E.matchEvent(fixture, []).status, 'unmatched')
  })

  test('CSV export has one row per match and quotes reasons', () => {
    const r = E.evaluateMatch({ fixture: fx({ status: 'NS', ts: KICKOFF, ft: null, homeName: 'A, B' }) }, {}, KICKOFF * 1000)
    const csv = E.toCSV([r]).split('\n')
    assert.equal(csv.length, 2)
    assert.match(csv[1], /"A, B"/)
  })
})
