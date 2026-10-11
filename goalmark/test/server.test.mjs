import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.GOALMARK_APIFOOTBALL_KEY = 'FB-KEY'
process.env.GOALMARK_ODDSAPI_KEY = 'ODDS-KEY'
const { server, upstreamFor } = await import('../server.mjs')

test('keys are added by the relay and a client-supplied apiKey is dropped', () => {
  const odds = upstreamFor('odds', '/v4/sports/soccer_epl/events/abc123/odds', '?apiKey=evil&markets=totals')
  assert.match(odds.url, /apiKey=ODDS-KEY/)
  assert.doesNotMatch(odds.url, /evil/)
  const fb = upstreamFor('football', '/fixtures', '?date=2026-10-11')
  assert.equal(fb.headers['x-apisports-key'], 'FB-KEY')
  assert.doesNotMatch(fb.url, /FB-KEY/)
})

test('only the read-only routes Goalmark uses are forwarded', () => {
  assert.equal(upstreamFor('football', '/teams', ''), null)
  assert.equal(upstreamFor('odds', '/v4/sports/soccer_epl/scores', ''), null)
  assert.equal(upstreamFor('other', '/fixtures', ''), null)
})

test('the HTTP relay needs its client header and only answers preflights from allowed origins', async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    assert.equal((await fetch(base + '/relay/status')).status, 400)
    const ok = await fetch(base + '/relay/status', { headers: { 'x-goalmark-client': '1' } })
    assert.deepEqual(await ok.json(), { relay: 'goalmark', football: true, odds: true, accessToken: false })
    assert.equal((await fetch(base + '/relay/football/teams', { headers: { 'x-goalmark-client': '1' } })).status, 404)
    assert.equal((await fetch(base + '/relay/status', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } })).status, 403)
    const pre = await fetch(base + '/relay/status', { method: 'OPTIONS', headers: { origin: 'null' } })
    assert.equal(pre.status, 204)
    assert.equal(pre.headers.get('access-control-allow-origin'), 'null')
    const body = await (await fetch(base + '/relay/status', { headers: { 'x-goalmark-client': '1' } })).text()
    assert.doesNotMatch(body, /KEY/)
  } finally {
    server.close()
  }
})
