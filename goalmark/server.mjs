#!/usr/bin/env node
// Goalmark relay: serves the app and forwards an allowlist of read-only
// provider requests, adding API keys from the environment. Keys never reach
// the browser, the request log, or the source tree.
//
//   GOALMARK_APIFOOTBALL_KEY=...  GOALMARK_ODDSAPI_KEY=...  node goalmark/server.mjs
//
// Optional: PORT (8787), HOST (127.0.0.1; use 0.0.0.0 to reach it from a phone
// on your network), GOALMARK_ACCESS_TOKEN (required as x-goalmark-token when set).
// A goalmark/.env file with KEY=VALUE lines is read if present (it is git-ignored).

import http from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

const envFile = join(here, '.env')
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const PORT = Number(process.env.PORT || 8787)
const HOST = process.env.HOST || '127.0.0.1'
const FOOTBALL_KEY = process.env.GOALMARK_APIFOOTBALL_KEY || ''
const ODDS_KEY = process.env.GOALMARK_ODDSAPI_KEY || ''
const ACCESS = process.env.GOALMARK_ACCESS_TOKEN || ''

const FOOTBALL_ROUTES = [/^\/fixtures$/, /^\/fixtures\/headtohead$/, /^\/status$/]
const ODDS_ROUTES = [/^\/v4\/sports$/, /^\/v4\/sports\/[a-z0-9_]+\/events$/, /^\/v4\/sports\/[a-z0-9_]+\/events\/[A-Za-z0-9]+\/odds$/]
const PASS_HEADERS = ['x-ratelimit-requests-remaining', 'x-ratelimit-requests-limit', 'x-ratelimit-remaining', 'x-ratelimit-limit', 'x-requests-remaining', 'x-requests-used', 'x-requests-last']

const appFile = join(here, 'dist', 'goalmark.html')
// Pages opened from a file (origin "null") may call the relay; add others, comma-separated.
const ALLOWED_ORIGINS = new Set(['null', ...(process.env.GOALMARK_ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean)])

function corsHeaders(req) {
  const origin = req.headers.origin
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {}
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'x-goalmark-client, x-goalmark-token',
    'access-control-expose-headers': PASS_HEADERS.join(', '),
    vary: 'Origin',
  }
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'cache-control': 'no-store', ...headers })
  res.end(body)
}

function log(method, path, status, started) {
  // Path only: no query string, no headers, so nothing secret is ever printed.
  console.log(`${new Date().toISOString()} ${method} ${path} -> ${status} (${Date.now() - started} ms)`)
}

export function upstreamFor(provider, path, search) {
  const params = new URLSearchParams(search)
  params.delete('apiKey')
  if (provider === 'football') {
    if (!FOOTBALL_ROUTES.some((r) => r.test(path))) return null
    const q = params.toString()
    return { url: `https://v3.football.api-sports.io${path}${q ? '?' + q : ''}`, headers: { 'x-apisports-key': FOOTBALL_KEY }, hasKey: FOOTBALL_KEY !== '' }
  }
  if (provider === 'odds') {
    if (!ODDS_ROUTES.some((r) => r.test(path))) return null
    params.set('apiKey', ODDS_KEY)
    return { url: `https://api.the-odds-api.com${path}?${params.toString()}`, headers: {}, hasKey: ODDS_KEY !== '' }
  }
  return null
}

const server = http.createServer(async (req, res) => {
  const started = Date.now()
  const url = new URL(req.url, 'http://local')
  const cors = corsHeaders(req)
  if (req.method === 'OPTIONS' && url.pathname.startsWith('/relay/')) return send(res, Object.keys(cors).length ? 204 : 403, '', cors)
  if (req.method !== 'GET') return send(res, 405, 'GET only')

  if (url.pathname === '/' || url.pathname === '/index.html') {
    if (!existsSync(appFile)) return send(res, 500, 'Run "node goalmark/build.mjs" first.', { 'content-type': 'text/plain' })
    return send(res, 200, readFileSync(appFile), { 'content-type': 'text/html; charset=utf-8' })
  }

  if (!url.pathname.startsWith('/relay/')) return send(res, 404, 'Not found')
  const reply = (status, body, headers = {}) => send(res, status, body, { ...cors, ...headers })
  if (req.headers['x-goalmark-client'] !== '1') {
    log('GET', url.pathname, 400, started)
    return reply(400, JSON.stringify({ message: 'Missing x-goalmark-client header' }), { 'content-type': 'application/json' })
  }
  if (ACCESS && req.headers['x-goalmark-token'] !== ACCESS) {
    log('GET', url.pathname, 401, started)
    return reply(401, JSON.stringify({ message: 'Relay access token missing or wrong' }), { 'content-type': 'application/json' })
  }

  if (url.pathname === '/relay/status') {
    return reply(200, JSON.stringify({ relay: 'goalmark', football: FOOTBALL_KEY !== '', odds: ODDS_KEY !== '', accessToken: ACCESS !== '' }), { 'content-type': 'application/json' })
  }

  const m = /^\/relay\/(football|odds)(\/.*)$/.exec(url.pathname)
  const target = m ? upstreamFor(m[1], m[2], url.search) : null
  if (!target) {
    log('GET', url.pathname, 404, started)
    return reply(404, JSON.stringify({ message: 'This relay only forwards the read-only routes Goalmark uses' }), { 'content-type': 'application/json' })
  }
  if (!target.hasKey) {
    log('GET', url.pathname, 503, started)
    return reply(503, JSON.stringify({ message: `Set ${m[1] === 'football' ? 'GOALMARK_APIFOOTBALL_KEY' : 'GOALMARK_ODDSAPI_KEY'} before starting the relay` }), { 'content-type': 'application/json' })
  }
  try {
    const up = await fetch(target.url, { headers: target.headers })
    const body = Buffer.from(await up.arrayBuffer())
    const headers = { 'content-type': up.headers.get('content-type') || 'application/json' }
    for (const h of PASS_HEADERS) {
      const v = up.headers.get(h)
      if (v !== null) headers[h] = v
    }
    log('GET', url.pathname, up.status, started)
    reply(up.status, body, headers)
  } catch {
    log('GET', url.pathname, 502, started)
    reply(502, JSON.stringify({ message: 'The relay could not reach the provider' }), { 'content-type': 'application/json' })
  }
})

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  server.listen(PORT, HOST, () => {
    console.log(`Goalmark on http://${HOST}:${PORT}  (API-Football key ${FOOTBALL_KEY ? 'set' : 'MISSING'}, Odds API key ${ODDS_KEY ? 'set' : 'MISSING'}${ACCESS ? ', access token required' : ''})`)
    if (HOST === '0.0.0.0' && !ACCESS) console.log('Warning: reachable from your network with no GOALMARK_ACCESS_TOKEN; anyone on it could spend your API quota.')
  })
}

export { server }
