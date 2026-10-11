/*
 * Goalmark data layer: provider clients, quota tracking and the scan loop.
 * Network calls go through an injected fetch so tests can run it offline.
 * API keys are never written into URLs that are logged: in relay mode the
 * browser never holds them, and in direct mode the request log redacts them.
 */
(function (root) {
  'use strict'

  var E = typeof module !== 'undefined' && module.exports ? require('./engine.js') : root.GoalmarkEngine

  var FOOTBALL_BASE = 'https://v3.football.api-sports.io'
  var ODDS_BASE = 'https://api.the-odds-api.com'

  /*
   * API-Football league id -> The Odds API sport key. This is Goalmark's own
   * mapping, checked at scan time against the odds feed's live sport list;
   * a competition outside it is reported as a coverage gap, never guessed.
   */
  var LEAGUE_MAP = [
    { id: 39, key: 'soccer_epl', name: 'Premier League', country: 'England' },
    { id: 40, key: 'soccer_efl_champ', name: 'Championship', country: 'England' },
    { id: 41, key: 'soccer_england_league1', name: 'League One', country: 'England' },
    { id: 42, key: 'soccer_england_league2', name: 'League Two', country: 'England' },
    { id: 45, key: 'soccer_fa_cup', name: 'FA Cup', country: 'England' },
    { id: 48, key: 'soccer_england_efl_cup', name: 'EFL Cup', country: 'England' },
    { id: 140, key: 'soccer_spain_la_liga', name: 'La Liga', country: 'Spain' },
    { id: 141, key: 'soccer_spain_segunda_division', name: 'Segunda División', country: 'Spain' },
    { id: 135, key: 'soccer_italy_serie_a', name: 'Serie A', country: 'Italy' },
    { id: 136, key: 'soccer_italy_serie_b', name: 'Serie B', country: 'Italy' },
    { id: 78, key: 'soccer_germany_bundesliga', name: 'Bundesliga', country: 'Germany' },
    { id: 79, key: 'soccer_germany_bundesliga2', name: '2. Bundesliga', country: 'Germany' },
    { id: 80, key: 'soccer_germany_liga3', name: '3. Liga', country: 'Germany' },
    { id: 61, key: 'soccer_france_ligue_one', name: 'Ligue 1', country: 'France' },
    { id: 62, key: 'soccer_france_ligue_two', name: 'Ligue 2', country: 'France' },
    { id: 88, key: 'soccer_netherlands_eredivisie', name: 'Eredivisie', country: 'Netherlands' },
    { id: 94, key: 'soccer_portugal_primeira_liga', name: 'Primeira Liga', country: 'Portugal' },
    { id: 144, key: 'soccer_belgium_first_div', name: 'Jupiler Pro League', country: 'Belgium' },
    { id: 179, key: 'soccer_spl', name: 'Premiership', country: 'Scotland' },
    { id: 203, key: 'soccer_turkey_super_league', name: 'Süper Lig', country: 'Turkey' },
    { id: 197, key: 'soccer_greece_super_league', name: 'Super League 1', country: 'Greece' },
    { id: 218, key: 'soccer_austria_bundesliga', name: 'Bundesliga', country: 'Austria' },
    { id: 207, key: 'soccer_switzerland_superleague', name: 'Super League', country: 'Switzerland' },
    { id: 119, key: 'soccer_denmark_superliga', name: 'Superliga', country: 'Denmark' },
    { id: 103, key: 'soccer_norway_eliteserien', name: 'Eliteserien', country: 'Norway' },
    { id: 113, key: 'soccer_sweden_allsvenskan', name: 'Allsvenskan', country: 'Sweden' },
    { id: 106, key: 'soccer_poland_ekstraklasa', name: 'Ekstraklasa', country: 'Poland' },
    { id: 2, key: 'soccer_uefa_champs_league', name: 'UEFA Champions League', country: 'World' },
    { id: 3, key: 'soccer_uefa_europa_league', name: 'UEFA Europa League', country: 'World' },
    { id: 848, key: 'soccer_uefa_europa_conference_league', name: 'UEFA Conference League', country: 'World' },
    { id: 253, key: 'soccer_usa_mls', name: 'Major League Soccer', country: 'USA' },
    { id: 262, key: 'soccer_mexico_ligamx', name: 'Liga MX', country: 'Mexico' },
    { id: 71, key: 'soccer_brazil_campeonato', name: 'Série A', country: 'Brazil' },
    { id: 128, key: 'soccer_argentina_primera_division', name: 'Liga Profesional', country: 'Argentina' },
    { id: 98, key: 'soccer_japan_j_league', name: 'J1 League', country: 'Japan' },
    { id: 292, key: 'soccer_korea_kleague1', name: 'K League 1', country: 'South Korea' },
    { id: 188, key: 'soccer_australia_aleague', name: 'A-League Men', country: 'Australia' },
    { id: 307, key: 'soccer_saudi_arabia_pro_league', name: 'Pro League', country: 'Saudi Arabia' },
  ]

  /*
   * Sportsbooks supported for Maine. Licensing was checked against the Maine
   * Gambling Control Unit's sports wagering page (via its search listing on
   * 2026-10-11: DraftKings and Caesars Sportsbook). The Odds API files
   * Caesars under the key williamhill_us. A price in the feed is a listing,
   * not proof that the market is open to a Maine account.
   */
  var SPORTSBOOKS = [
    { key: 'draftkings', name: 'DraftKings', maineLicensee: 'DraftKings Inc.' },
    { key: 'williamhill_us', name: 'Caesars Sportsbook', maineLicensee: 'Caesars Sportsbook' },
  ]

  function ProviderError(provider, message, kind, status) {
    this.name = 'ProviderError'
    this.provider = provider
    this.message = message
    this.kind = kind || 'error'
    this.status = status || null
  }
  ProviderError.prototype = Object.create(Error.prototype)

  function query(params) {
    var parts = []
    Object.keys(params || {}).forEach(function (k) {
      var v = params[k]
      if (v === undefined || v === null || v === '') return
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v))
    })
    return parts.length ? '?' + parts.join('&') : ''
  }

  function header(res, name) {
    var v = res.headers && res.headers.get ? res.headers.get(name) : null
    return v === null || v === undefined || v === '' ? null : v
  }

  function wait(ms, signal) {
    return new Promise(function (resolve, reject) {
      if (signal && signal.aborted) return reject(new ProviderError('scan', 'Stopped', 'aborted'))
      var t = setTimeout(resolve, ms)
      if (signal) signal.addEventListener('abort', function () { clearTimeout(t); reject(new ProviderError('scan', 'Stopped', 'aborted')) }, { once: true })
    })
  }

  /**
   * conn: { mode: 'relay' | 'direct', relayBase, footballKey, oddsKey }
   * opts: { fetch, footballPerMinute, onRequest(entry), now() }
   */
  function createClient(conn, opts) {
    var doFetch = opts.fetch
    var now = opts.now || function () { return Date.now() }
    var spacing = 60000 / Math.max(1, Number(opts.footballPerMinute) || 10)
    var lastFootballAt = 0
    var quota = { football: { dayRemaining: null, dayLimit: null, minuteRemaining: null }, odds: { remaining: null, used: null, last: null } }

    async function call(provider, path, params, signal) {
      var url
      var headers = {}
      if (conn.mode === 'relay') {
        url = String(conn.relayBase || '/relay').replace(/\/$/, '') + '/' + provider + path + query(params)
        // A custom header forces a CORS preflight, so other websites cannot spend the relay's quota.
        headers['x-goalmark-client'] = '1'
        if (conn.relayToken) headers['x-goalmark-token'] = conn.relayToken
      } else if (provider === 'football') {
        if (!conn.footballKey) throw new ProviderError('API-Football', 'No API-Football key set', 'setup')
        url = FOOTBALL_BASE + path + query(params)
        headers['x-apisports-key'] = conn.footballKey
      } else {
        if (!conn.oddsKey) throw new ProviderError('The Odds API', 'No Odds API key set', 'setup')
        url = ODDS_BASE + path + query(Object.assign({}, params, { apiKey: conn.oddsKey }))
      }
      var shown = provider + path + query(params)
      if (provider === 'football') {
        var gap = lastFootballAt + spacing - now()
        if (gap > 0) await wait(gap, signal)
        lastFootballAt = now()
      }
      var started = now()
      var entry = { provider: provider === 'football' ? 'API-Football' : 'The Odds API', path: shown, at: new Date(started).toISOString(), status: null, ms: null, error: null }
      var res
      try {
        res = await doFetch(url, { headers: headers, signal: signal })
      } catch (err) {
        if (signal && signal.aborted) throw new ProviderError(entry.provider, 'Stopped', 'aborted')
        entry.error = conn.mode === 'direct' ? 'Network error or blocked by the browser (CORS). Try the relay.' : 'Network error reaching the relay'
        entry.ms = now() - started
        opts.onRequest && opts.onRequest(entry)
        throw new ProviderError(entry.provider, entry.error, 'network')
      }
      entry.status = res.status
      entry.ms = now() - started
      if (provider === 'football') {
        var day = header(res, 'x-ratelimit-requests-remaining')
        var limit = header(res, 'x-ratelimit-requests-limit')
        var minute = header(res, 'x-ratelimit-remaining')
        if (day !== null) quota.football.dayRemaining = Number(day)
        if (limit !== null) quota.football.dayLimit = Number(limit)
        if (minute !== null) quota.football.minuteRemaining = Number(minute)
      } else {
        var rem = header(res, 'x-requests-remaining')
        var used = header(res, 'x-requests-used')
        var last = header(res, 'x-requests-last')
        if (rem !== null) quota.odds.remaining = Number(rem)
        if (used !== null) quota.odds.used = Number(used)
        if (last !== null) quota.odds.last = Number(last)
      }
      var body = null
      try { body = await res.json() } catch (e) { body = null }
      if (res.status === 429) {
        entry.error = 'Rate limit or quota reached'
        opts.onRequest && opts.onRequest(entry)
        throw new ProviderError(entry.provider, entry.error, 'quota', 429)
      }
      if (res.status === 401 || res.status === 403) {
        entry.error = (body && (body.message || (body.errors && JSON.stringify(body.errors)))) || 'Key rejected'
        opts.onRequest && opts.onRequest(entry)
        throw new ProviderError(entry.provider, String(entry.error), 'auth', res.status)
      }
      if (!res.ok) {
        entry.error = (body && (body.message || body.error)) || 'HTTP ' + res.status
        opts.onRequest && opts.onRequest(entry)
        throw new ProviderError(entry.provider, String(entry.error), 'http', res.status)
      }
      if (provider === 'football' && body && body.errors && (Array.isArray(body.errors) ? body.errors.length > 0 : Object.keys(body.errors).length > 0)) {
        var msg = Array.isArray(body.errors) ? body.errors.join('; ') : Object.keys(body.errors).map(function (k) { return k + ': ' + body.errors[k] }).join('; ')
        entry.error = msg
        opts.onRequest && opts.onRequest(entry)
        var isQuota = /limit|quota|requests/i.test(msg)
        throw new ProviderError(entry.provider, msg, isQuota ? 'quota' : 'provider', res.status)
      }
      opts.onRequest && opts.onRequest(entry)
      return { body: body, at: new Date(started).toISOString() }
    }

    return {
      football: function (path, params, signal) { return call('football', path, params, signal) },
      odds: function (path, params, signal) { return call('odds', path, params, signal) },
      quota: quota,
      mode: conn.mode,
    }
  }

  function isoNoMs(ms) {
    return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
  }

  /**
   * Scans one date. Calls onPlan(plan) once fixtures and odds events are
   * known, then onResult(raw) per fixture with its raw evidence; the UI
   * evaluates raw evidence with the engine, so changing a setting never
   * needs a new request.
   */
  async function runScan(args) {
    var client = args.client
    var signal = args.signal
    var settings = E.withDefaults(args.settings)
    var nowMs = (args.now || Date.now)()
    var nowSec = Math.floor(nowMs / 1000)
    var bookmakerKey = args.bookmakerKey
    var progress = args.onProgress || function () {}
    var summary = {
      date: args.date, timezone: args.timezone, bookmakerKey: bookmakerKey, startedAt: new Date(nowMs).toISOString(),
      fixturesTotal: 0, fixturesUpcoming: 0, scanned: 0, notScanned: [], unmappedCompetitions: [], inactiveCompetitions: [],
      unmatched: [], failures: [], stoppedReason: null, sources: [],
    }

    function fail(where, err) {
      summary.failures.push({ where: where, provider: err.provider || 'Goalmark', message: err.message, kind: err.kind || 'error' })
    }

    progress({ phase: 'fixtures', done: 0, total: 0 })
    var fixturesRes = await client.football('/fixtures', { date: args.date, timezone: args.timezone }, signal)
    summary.sources.push({ what: 'Fixtures for ' + args.date, source: 'API-Football /fixtures', at: fixturesRes.at })
    var all = (fixturesRes.body.response || []).map(E.fromApiFootball)
    summary.fixturesTotal = all.length
    var upcoming = all.filter(function (fx) { return E.isUpcoming(fx, nowSec) })
    summary.fixturesUpcoming = upcoming.length

    var byId = {}
    LEAGUE_MAP.forEach(function (l) { byId[l.id] = l })
    var unmapped = {}
    var wanted = upcoming.filter(function (fx) {
      if (args.competitions && args.competitions.length > 0 && args.competitions.indexOf(fx.leagueId) === -1) return false
      if (!byId[fx.leagueId]) {
        var k = fx.leagueId + ''
        unmapped[k] = unmapped[k] || { leagueId: fx.leagueId, name: fx.leagueName, country: fx.country, count: 0 }
        unmapped[k].count += 1
        return args.includeUnmapped === true
      }
      return true
    })
    summary.unmappedCompetitions = Object.keys(unmapped).map(function (k) { return unmapped[k] })

    // Which mapped competitions does the odds feed carry right now? (/v4/sports costs no credits.)
    var activeKeys = {}
    try {
      var sportsRes = await client.odds('/v4/sports', {}, signal)
      ;(sportsRes.body || []).forEach(function (s) { if (s.active !== false) activeKeys[s.key] = true })
      summary.sources.push({ what: 'Odds feed competitions', source: 'The Odds API /v4/sports', at: sportsRes.at })
    } catch (err) {
      if (err.kind === 'aborted') throw err
      fail('Odds feed competition list', err)
    }

    // Odds events per competition (/events costs no credits).
    var eventsByKey = {}
    var keys = []
    wanted.forEach(function (fx) { var m = byId[fx.leagueId]; if (m && keys.indexOf(m.key) === -1) keys.push(m.key) })
    var from = Math.min.apply(null, wanted.map(function (f) { return f.ts * 1000 }).concat([nowMs])) - 3600000
    var to = Math.max.apply(null, wanted.map(function (f) { return f.ts * 1000 }).concat([nowMs])) + 3600000
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i]
      if (Object.keys(activeKeys).length > 0 && !activeKeys[key]) {
        summary.inactiveCompetitions.push(key)
        continue
      }
      progress({ phase: 'events', done: i, total: keys.length, label: key })
      try {
        var evRes = await client.odds('/v4/sports/' + key + '/events', { commenceTimeFrom: isoNoMs(from), commenceTimeTo: isoNoMs(to), dateFormat: 'iso' }, signal)
        eventsByKey[key] = { events: evRes.body || [], at: evRes.at }
      } catch (err) {
        if (err.kind === 'aborted') throw err
        fail('Odds events for ' + key, err)
      }
    }

    var plan = wanted.map(function (fx) {
      var m = byId[fx.leagueId]
      var raw = { fixture: fx, sportKey: m ? m.key : null, bookmakerKey: bookmakerKey, errors: [], retrieved: {} }
      if (!m) raw.match = { status: 'unmatched', reason: 'No odds mapping for this competition', candidates: [] }
      else if (!eventsByKey[m.key]) raw.match = { status: 'unmatched', reason: summary.inactiveCompetitions.indexOf(m.key) !== -1 ? 'The odds feed lists no active market for this competition' : 'Odds events could not be retrieved', candidates: [] }
      else raw.match = E.matchEvent(fx, eventsByKey[m.key].events, settings)
      if (raw.match.status !== 'matched') summary.unmatched.push({ fixtureId: fx.id, home: fx.homeName, away: fx.awayName, competition: fx.leagueName, reason: raw.match.reason, candidates: (raw.match.candidates || []).map(function (c) { return { id: c.event.id, home: c.event.home_team, away: c.event.away_team, commence: c.event.commence_time } }) })
      return raw
    })
    args.onPlan && args.onPlan(plan, summary)

    var seasonCache = {}
    var recentCache = {}
    async function cached(cache, key, fetcher) {
      if (!cache[key]) cache[key] = fetcher()
      return cache[key]
    }

    for (var n = 0; n < plan.length; n++) {
      var raw = plan[n]
      var fx = raw.fixture
      if (signal && signal.aborted) break
      progress({ phase: 'matches', done: n, total: plan.length, label: fx.homeName + ' v ' + fx.awayName })
      try {
        var get = async function (field, label, fetcher) {
          try {
            var r = await fetcher()
            raw[field] = (r.body.response || []).map(E.fromApiFootball)
            raw.retrieved[field] = { source: label, at: r.at }
          } catch (err) {
            if (err.kind === 'aborted' || err.kind === 'quota' || err.kind === 'auth') throw err
            raw.errors.push({ field: field, message: err.provider + ': ' + err.message })
          }
        }
        await get('seasonHome', 'API-Football /fixtures (team, league, season)', function () { return cached(seasonCache, fx.homeId + ':' + fx.leagueId + ':' + fx.season, function () { return client.football('/fixtures', { team: fx.homeId, league: fx.leagueId, season: fx.season }, signal) }) })
        await get('seasonAway', 'API-Football /fixtures (team, league, season)', function () { return cached(seasonCache, fx.awayId + ':' + fx.leagueId + ':' + fx.season, function () { return client.football('/fixtures', { team: fx.awayId, league: fx.leagueId, season: fx.season }, signal) }) })
        await get('recentHome', 'API-Football /fixtures (team, last 10, all competitions)', function () { return cached(recentCache, fx.homeId, function () { return client.football('/fixtures', { team: fx.homeId, last: 10 }, signal) }) })
        await get('recentAway', 'API-Football /fixtures (team, last 10, all competitions)', function () { return cached(recentCache, fx.awayId, function () { return client.football('/fixtures', { team: fx.awayId, last: 10 }, signal) }) })
        await get('h2h', 'API-Football /fixtures/headtohead', function () { return client.football('/fixtures/headtohead', { h2h: fx.homeId + '-' + fx.awayId, last: Number(settings.h2hWindow) + 5 }, signal) })

        if (raw.match.status !== 'matched') {
          raw.oddsError = 'Not matched to an odds event: ' + raw.match.reason
        } else if (args.pricesOnlyForCandidates !== false && E.preliminaryVerdict(raw, settings, nowMs) === 'fail') {
          raw.oddsSkipped = 'Not fetched: the match already fails rule 1, 2 or 3 (saves Odds API credits)'
        } else {
          await fetchOdds(client, raw, signal)
        }
      } catch (err) {
        if (err.kind === 'aborted') {
          summary.stoppedReason = 'Stopped by you'
          break
        }
        fail(fx.homeName + ' v ' + fx.awayName, err)
        if (err.kind === 'quota' || err.kind === 'auth') {
          summary.stoppedReason = err.provider + ': ' + err.message
          args.onResult && args.onResult(raw)
          for (var r = n + 1; r < plan.length; r++) summary.notScanned.push({ home: plan[r].fixture.homeName, away: plan[r].fixture.awayName, reason: summary.stoppedReason })
          break
        }
      }
      summary.scanned += 1
      args.onResult && args.onResult(raw)
    }
    if (signal && signal.aborted && !summary.stoppedReason) summary.stoppedReason = 'Stopped by you'
    if (summary.stoppedReason === 'Stopped by you') {
      for (var s2 = summary.scanned; s2 < plan.length; s2++) summary.notScanned.push({ home: plan[s2].fixture.homeName, away: plan[s2].fixture.awayName, reason: 'Scan stopped' })
    }
    summary.finishedAt = new Date((args.now || Date.now)()).toISOString()
    summary.quota = JSON.parse(JSON.stringify(client.quota))
    progress({ phase: 'done', done: plan.length, total: plan.length })
    return { plan: plan, summary: summary }
  }

  async function fetchOdds(client, raw, signal) {
    try {
      var res = await client.odds('/v4/sports/' + raw.sportKey + '/events/' + raw.match.event.id + '/odds', {
        bookmakers: raw.bookmakerKey, markets: 'totals,alternate_totals', oddsFormat: 'american', dateFormat: 'iso',
      }, signal)
      raw.oddsEvent = res.body
      raw.oddsFetchedAt = Date.parse(res.at)
      raw.oddsError = undefined
      raw.oddsSkipped = undefined
      raw.retrieved.odds = { source: 'The Odds API /events/{id}/odds (totals, alternate_totals)', at: res.at }
    } catch (err) {
      if (err.kind === 'aborted' || err.kind === 'quota' || err.kind === 'auth') throw err
      raw.oddsError = err.provider + ': ' + err.message
    }
  }

  var api = { LEAGUE_MAP: LEAGUE_MAP, SPORTSBOOKS: SPORTSBOOKS, createClient: createClient, runScan: runScan, fetchOdds: fetchOdds, ProviderError: ProviderError }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else root.GoalmarkScan = api
})(typeof window !== 'undefined' ? window : globalThis)
