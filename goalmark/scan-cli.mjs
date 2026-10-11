#!/usr/bin/env node
// Runs a Goalmark scan from the command line and writes a scan file the app opens.
//
//   GOALMARK_APIFOOTBALL_KEY=... GOALMARK_ODDSAPI_KEY=... \
//     node goalmark/scan-cli.mjs --date 2026-10-12 [--book draftkings|williamhill_us] [--tz America/New_York]
//
// Writes goalmark/scans/<date>-<book>.json and goalmark/dist/latest-scan.json.
import { writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const E = require('./src/engine.js')
const S = require('./src/scan.js')
const here = dirname(fileURLToPath(import.meta.url))

const arg = (name, fallback) => {
  const i = process.argv.indexOf('--' + name)
  return i === -1 ? fallback : process.argv[i + 1]
}
const date = arg('date', new Date().toISOString().slice(0, 10))
const book = arg('book', 'draftkings')
const tz = arg('tz', 'America/New_York')
const footballKey = process.env.GOALMARK_APIFOOTBALL_KEY
const oddsKey = process.env.GOALMARK_ODDSAPI_KEY

if (!footballKey || !oddsKey) {
  console.error(`Missing ${!footballKey ? 'GOALMARK_APIFOOTBALL_KEY' : ''} ${!oddsKey ? 'GOALMARK_ODDSAPI_KEY' : ''}`.trim())
  process.exit(2)
}
if (!S.SPORTSBOOKS.some((b) => b.key === book)) {
  console.error('Unknown --book; use draftkings or williamhill_us (Caesars)')
  process.exit(2)
}

const log = []
const client = S.createClient({ mode: 'direct', footballKey, oddsKey }, { fetch, footballPerMinute: Number(process.env.GOALMARK_FOOTBALL_PER_MINUTE || 10), onRequest: (e) => log.push(e) })
const settings = { ...E.withDefaults({}), footballPerMinute: 10, pricesOnlyForCandidates: true }
const raws = []
let summary
try {
  const out = await S.runScan({
    client, date, timezone: tz, bookmakerKey: book, settings, pricesOnlyForCandidates: true,
    onResult: (raw) => raws.push(raw),
    onProgress: (p) => { if (p.phase === 'matches') process.stdout.write(`\rScreening ${p.done + 1}/${p.total}   `) },
  })
  summary = out.summary
} catch (err) {
  console.error(`\nScan failed: ${err.provider ? err.provider + ': ' : ''}${err.message}`)
  process.exit(1)
}

const doc = { format: 'goalmark-scan', version: 1, savedAt: Date.now(), settings, summary, raws, log: log.slice(-500) }
mkdirSync(join(here, 'scans'), { recursive: true })
mkdirSync(join(here, 'dist'), { recursive: true })
writeFileSync(join(here, 'scans', `${date}-${book}.json`), JSON.stringify(doc))
writeFileSync(join(here, 'dist', 'latest-scan.json'), JSON.stringify(doc))

const results = raws.map((r) => E.evaluateMatch(r, settings, Date.now()))
const count = (v) => results.filter((r) => r.verdict === v).length
console.log(`\n${date} (${tz}), ${book}: ${summary.fixturesUpcoming} upcoming fixtures, ${raws.length} screened`)
console.log(`Passes all four: ${count('pass')} | Fails: ${count('fail')} | Needs more data: ${count('unknown')}`)
for (const r of results.filter((x) => x.verdict === 'pass')) {
  const r4 = r.rules[3]
  console.log(`  PASS ${r.fixture.homeName} v ${r.fixture.awayName} (${r.fixture.leagueName}) Over 1.5 ${E.formatAmerican(r4.american)}`)
}
if (summary.stoppedReason) console.log(`Stopped early: ${summary.stoppedReason}`)
console.log(`Unmatched to odds: ${summary.unmatched.length}; failed requests: ${summary.failures.length}`)
console.log(`Quota left: API-Football ${client.quota.football.dayRemaining ?? '?'} today, The Odds API ${client.quota.odds.remaining ?? '?'} credits`)
