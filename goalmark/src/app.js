/* Goalmark interface. Depends on GoalmarkEngine and GoalmarkScan. */
(function () {
  'use strict'

  var E = window.GoalmarkEngine
  var S = window.GoalmarkScan
  var BUILD = window.GOALMARK_BUILD || 'standalone'
  var IS_VIEWER = BUILD === 'artifact'
  var $ = function (id) { return document.getElementById(id) }

  // ---------- Storage (per device; every access guarded) ----------
  var store = {
    get: function (k) { try { var v = localStorage.getItem(k); return v === null ? null : JSON.parse(v) } catch (e) { return null } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch (e) { /* storage unavailable */ } },
    del: function (k) { try { localStorage.removeItem(k) } catch (e) { /* storage unavailable */ } },
  }

  var APP_DEFAULTS = { footballPerMinute: 10, pricesOnlyForCandidates: true }
  function loadSettings() {
    return Object.assign({}, E.withDefaults({}), APP_DEFAULTS, store.get('goalmark.settings') || {})
  }
  function defaultRelayBase() {
    return location.protocol === 'http:' || location.protocol === 'https:' ? '/relay' : 'http://127.0.0.1:8787/relay'
  }
  function loadConn() {
    var c = store.get('goalmark.conn') || {}
    return { mode: c.mode || 'relay', relayBase: c.relayBase || defaultRelayBase(), relayToken: c.relayToken || '', footballKey: c.footballKey || '', oddsKey: c.oddsKey || '', remember: !!c.remember, tested: null }
  }

  var state = {
    settings: loadSettings(),
    conn: loadConn(),
    bookmakerKey: store.get('goalmark.book') || 'draftkings',
    competitions: store.get('goalmark.comps'), // null = all mapped
    includeUnmapped: false,
    raws: [],
    plannedCount: 0,
    summary: null,
    log: [],
    running: false,
    controller: null,
    client: null,
    progress: null,
    imported: null, // { savedAt, asOfSave }
    open: {},
    fatal: null,
  }

  // ---------- Helpers ----------
  function esc(v) {
    return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] })
  }
  var tz = (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch (e) { return 'UTC' } })()
  function fmtTime(sec) { return new Date(sec * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?([AP]M)$/i, function (m, x) { return x.toLowerCase() }) }
  function fmtDay(sec) { return new Date(sec * 1000).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) }
  function fmtDate(iso) { if (!iso) return '—'; var d = new Date(iso); return isNaN(d) ? esc(iso) : d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) }
  function fmtStamp(iso) { if (!iso) return '—'; var d = new Date(iso); return isNaN(d) ? esc(iso) : d.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }) }
  function ago(min) {
    if (min === null || min === undefined || !isFinite(min)) return 'unknown age'
    if (min < 1) return 'under a minute ago'
    if (min < 90) return Math.round(min) + ' min ago'
    return (min / 60).toFixed(1) + ' h ago'
  }
  function pct(p, dp) { return p === null || p === undefined ? '—' : (p * 100).toFixed(dp === undefined ? 2 : dp) + '%' }
  function today() {
    var d = new Date()
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  }
  function nowForEval() {
    return state.imported && state.imported.asOfSave ? state.imported.savedAt : Date.now()
  }
  function statusWord(s) { return { pass: 'Pass', fail: 'Fail', unknown: 'Unknown', skipped: 'Not checked' }[s] || s }
  function bookName(key) { var b = S.SPORTSBOOKS.filter(function (x) { return x.key === key })[0]; return b ? b.name : key }

  var renderQueued = false
  function renderSoon() {
    if (renderQueued) return
    renderQueued = true
    requestAnimationFrame(function () { renderQueued = false; renderAll() })
  }

  // ---------- Static parts ----------
  function renderBuildNotice() {
    var box = $('buildNotice')
    if (IS_VIEWER) {
      box.hidden = false
      box.innerHTML = '<strong>This copy cannot fetch live data.</strong><span>The page runs inside claude.ai, which blocks requests to API-Football and The Odds API. Use it to review a scan saved from the standalone Goalmark (Open saved scan). To scan live, run <span class="mono">node goalmark/server.mjs</span> with your keys and open it in your browser.</span>'
    }
  }

  function renderBooks() {
    $('bookSeg').innerHTML = S.SPORTSBOOKS.map(function (b) {
      return '<label><input type="radio" name="book" value="' + esc(b.key) + '"' + (b.key === state.bookmakerKey ? ' checked' : '') + '> ' + esc(b.name) + '</label>'
    }).join('')
    $('booksBody').innerHTML =
      '<p>The Maine Gambling Control Unit licenses mobile sports wagering. On 2026-10-11 its <a href="https://www.maine.gov/dps/gcu/sports-wagering" target="_blank" rel="noopener">sports wagering page</a> listed <strong>DraftKings</strong> and <strong>Caesars Sportsbook</strong> as mobile operators. That check used the page\'s search listing; the page itself could not be opened from the build environment. Re-check the page before relying on it.</p>' +
      '<ul>' + S.SPORTSBOOKS.map(function (b) { return '<li><strong>' + esc(b.name) + '</strong>: odds feed key <span class="mono">' + esc(b.key) + '</span></li>' }).join('') + '</ul>' +
      '<p class="hint">A price here means the bookmaker\'s US feed lists the market. It does not confirm that the market, line or price is open to your Maine account. Check it in the sportsbook app before acting.</p>'
  }

  function renderComps() {
    var groups = {}
    S.LEAGUE_MAP.forEach(function (l) { (groups[l.country] = groups[l.country] || []).push(l) })
    var sel = state.competitions
    $('compList').innerHTML = Object.keys(groups).sort().map(function (c) {
      return '<div class="country">' + esc(c) + '</div>' + groups[c].map(function (l) {
        var checked = sel === null || sel === undefined || sel.indexOf(l.id) !== -1
        return '<label><input type="checkbox" data-league="' + l.id + '"' + (checked ? ' checked' : '') + '> ' + esc(l.name) + '</label>'
      }).join('')
    }).join('')
    var n = sel === null || sel === undefined ? S.LEAGUE_MAP.length : sel.length
    $('compSummary').textContent = n === S.LEAGUE_MAP.length ? 'All mapped competitions (' + n + ')' : n + ' of ' + S.LEAGUE_MAP.length + ' competitions'
    $('includeUnmapped').checked = state.includeUnmapped
  }

  function renderSettings() {
    var s = state.settings
    $('sAssumed').value = (Number(s.assumedWinProb) * 100).toFixed(1)
    $('sWindow').value = s.h2hWindow
    $('sMinSample').value = s.h2hMinSample
    $('sSeasonMin').value = s.seasonMinPlayed
    $('sStale').value = s.staleOddsMinutes
    $('sRpm').value = s.footballPerMinute
    $('sCandidatesOnly').checked = s.pricesOnlyForCandidates !== false
    Array.prototype.forEach.call(document.querySelectorAll('input[name="priceRule"]'), function (r) { r.checked = r.value === s.priceRule })
  }

  function renderConn() {
    var dot = $('connDot')
    var text = $('connText')
    dot.className = 'dot'
    if (IS_VIEWER) {
      text.textContent = 'Viewer only, no live data'
      dot.classList.add('warn')
      return
    }
    var c = state.conn
    var label = c.mode === 'relay' ? 'Relay' : 'Browser keys'
    if (c.mode === 'direct' && (!c.footballKey || !c.oddsKey)) { text.textContent = label + ': keys missing'; dot.classList.add('bad'); return }
    if (c.tested === true) { text.textContent = label + ': connected'; dot.classList.add('ok'); return }
    if (c.tested === false) { text.textContent = label + ': check failed'; dot.classList.add('bad'); return }
    text.textContent = label + ': not tested'
  }

  // ---------- Results ----------
  function evaluated() {
    var now = nowForEval()
    return state.raws.map(function (raw) { return E.evaluateMatch(raw, state.settings, now) }).sort(function (a, b) { return a.fixture.ts - b.fixture.ts })
  }

  function pipRow(rules) {
    return '<span class="pips" aria-label="Rules">' + rules.map(function (r) {
      return '<span class="pip ' + esc(r.status) + '" title="Rule ' + r.rule + ': ' + esc(statusWord(r.status)) + '">' + r.rule + '</span>'
    }).join('') + '</span>'
  }

  function priceTag(r4) {
    if (r4.american === undefined || r4.american === null) return '<span class="price muted">O1.5 —</span>'
    return '<span class="price">O1.5 ' + esc(E.formatAmerican(r4.american)) + '</span>'
  }

  function ruleBlock(r, title, presenterText, body) {
    return '<div class="rule ' + esc(r.status === 'skipped' ? 'unknown' : r.status) + '">' +
      '<div class="rule-head"><h3>' + r.rule + ' · ' + esc(title) + '</h3><span class="verdict ' + esc(r.status) + '">' + esc(statusWord(r.status)) + '</span></div>' +
      '<div class="hint"><span class="tag presenter">Presenter</span> ' + esc(presenterText) + '</div>' +
      '<ul>' + r.reasons.map(function (x) { return '<li>' + esc(x) + '</li>' }).join('') + '</ul>' + body + '</div>'
  }

  function sourceLine(raw, field) {
    var r = raw.retrieved && raw.retrieved[field]
    return r ? '<div class="hint">Source: ' + esc(r.source) + ', retrieved ' + esc(fmtStamp(r.at)) + '</div>' : '<div class="hint">Source: not retrieved</div>'
  }

  function rule1Html(r, raw) {
    var rows = [r.home, r.away].map(function (t, i) {
      var name = i === 0 ? raw.fixture.homeName : raw.fixture.awayName
      if (!t) return '<tr><td>' + esc(name) + '</td><td colspan="4" class="na">No data</td></tr>'
      var ok = t.average !== null && t.average >= Number(state.settings.seasonAvgThreshold)
      return '<tr><td>' + esc(t.teamName) + '</td><td>' + t.goals + '</td><td>' + t.played + '</td><td class="' + (t.average === null ? 'na' : ok ? 'ok' : 'no') + '">' + (t.average === null ? '—' : t.average.toFixed(2)) + '</td><td>' + esc(t.competition) + '</td></tr>'
    }).join('')
    var combined = r.combinedAverage === null || r.combinedAverage === undefined ? '' :
      '<div class="caveat">Combined: ' + r.combinedAverage.toFixed(2) + ' goals per game (home average + away average). Adding the two averages is a screening shortcut, not a validated expected-goals model.</div>'
    var excluded = [r.home, r.away].filter(function (t) { return t && t.excluded.length > 0 }).map(function (t) { return t.teamName + ': ' + t.excluded.length + ' match(es) without a regulation score excluded' })
    return ruleBlock(r, 'Season scoring averages', 'Both teams average at least 1.0 goals scored per game this season.',
      '<div class="tablewrap"><table><thead><tr><th>Team</th><th>Goals</th><th>Played</th><th>Average</th><th>Competition used</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      combined + (excluded.length ? '<div class="hint">' + esc(excluded.join('; ')) + '</div>' : '') +
      '<div class="hint">Regulation-time goals in the fixture\'s own competition this season, completed matches before kickoff only. App minimum: ' + esc(state.settings.seasonMinPlayed) + ' matches.</div>' +
      sourceLine(raw, 'seasonHome'))
  }

  function rule2Html(r, raw) {
    var rows = r.meetings.map(function (m) {
      return '<tr><td>' + esc(fmtDate(m.date)) + '</td><td>' + esc(m.home) + ' v ' + esc(m.away) + '</td><td>' + (m.score ? m.score.home + '–' + m.score.away : '<span class="na">no 90-min score</span>') + '</td><td>' + (m.total === null ? '—' : m.total) + '</td><td class="' + (m.isOver === null ? 'na' : m.isOver ? 'ok' : 'no') + '">' + (m.isOver === null ? 'excluded' : m.isOver ? 'Yes' : 'No') + '</td><td>' + esc(m.competition || '') + '</td></tr>'
    }).join('')
    return ruleBlock(r, 'Head-to-head results', 'More than 80% of previous meetings finished with over 1.5 combined goals.',
      '<dl class="kv"><dt>Qualifying</dt><dd>' + r.qualifying + ' of ' + r.sample + ' usable meetings</dd><dt>Percentage</dt><dd>' + (r.pct === null ? '—' : r.pct.toFixed(1) + '%') + ' (needs more than ' + esc(state.settings.h2hThresholdPct) + '%)</dd>' +
      '<dt>History window</dt><dd>Latest ' + esc(r.window || state.settings.h2hWindow) + ' meetings, minimum ' + esc(r.minSample || state.settings.h2hMinSample) + ' <span class="tag">App setting</span></dd></dl>' +
      (rows ? '<div class="tablewrap"><table><thead><tr><th>Date</th><th>Match</th><th>90-min score</th><th>Total</th><th>Over 1.5</th><th>Competition</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="empty">No previous meetings found.</div>') +
      sourceLine(raw, 'h2h'))
  }

  function formTable(f) {
    if (!f) return '<div class="empty">No recent results.</div>'
    var rows = f.rows.map(function (x) {
      return '<tr><td>' + esc(fmtDate(x.date)) + '</td><td>' + esc(x.opponent) + '</td><td>' + (x.isHome ? 'H' : 'A') + '</td><td>' + (x.score ? x.score.home + '–' + x.score.away : '<span class="na">no 90-min score</span>') + '</td><td class="' + (x.scored === null ? 'na' : x.scored ? 'ok' : 'no') + '">' + (x.scored === null ? '?' : x.scored ? 'Scored' : 'Blank') + '</td><td>' + esc(x.competition || '') + '</td></tr>'
    }).join('')
    return '<div><strong>' + esc(f.teamName) + '</strong> <span class="muted">scored in ' + f.scoredIn + ' of ' + f.rows.length + '</span></div>' +
      '<div class="tablewrap"><table><thead><tr><th>Date</th><th>Opponent</th><th>H/A</th><th>90-min score</th><th>' + esc(f.teamName) + '</th><th>Competition</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
  }

  function rule3Html(r, raw) {
    return ruleBlock(r, 'Recent scoring form', 'Each team scored at least once in at least 4 of its last 5 completed matches. Both teams need not score in the same match.',
      formTable(r.home) + formTable(r.away) +
      '<div class="hint">Sample: each team\'s latest completed matches in all competitions (from its last 10 fixtures in API-Football), before this kickoff, regulation time only.</div>' +
      sourceLine(raw, 'recentHome'))
  }

  function rule4Html(r, raw) {
    var sel = r.selection || {}
    var body
    if (r.american === undefined || r.american === null) {
      body = '<div class="hint">' + esc(sel.bookmaker ? sel.bookmaker + ': ' : '') + 'no usable Over 1.5 price.</div>'
    } else {
      var per100 = r.expectedReturn === null ? '—' : (r.expectedReturn >= 0 ? '+' : '−') + '$' + Math.abs(r.expectedReturn * 100).toFixed(2)
      body = '<dl class="kv">' +
        '<dt>Sportsbook</dt><dd>' + esc(sel.bookmaker) + ' <span class="mono">(' + esc(sel.bookmakerKey) + ')</span></dd>' +
        '<dt>Market</dt><dd>Match total goals, Over ' + esc(sel.point) + ' <span class="mono">' + esc(sel.market) + '</span></dd>' +
        '<dt>Price</dt><dd class="mono">' + esc(E.formatAmerican(r.american)) + (Math.round(r.american) !== r.american ? ' (' + r.american.toFixed(2) + ')' : '') + ' · decimal ' + (r.decimal ? r.decimal.toFixed(4) : '—') + '</dd>' +
        '<dt>Implied probability</dt><dd class="mono">' + pct(r.impliedProb, 4) + ' (includes the bookmaker\'s margin)</dd>' +
        '<dt>Assumed probability</dt><dd>' + pct(r.assumedProb, 1) + ' <span class="tag">App setting</span>; the presenter claims 87% (unverified)</dd>' +
        '<dt>Break-even price</dt><dd class="mono">' + esc(r.breakEvenAmerican === null ? '—' : (r.breakEvenAmerican < 0 ? '−' : '+') + Math.abs(r.breakEvenAmerican).toFixed(2)) + ' at ' + pct(r.assumedProb, 1) + '</dd>' +
        '<dt>Expected return</dt><dd>' + esc(per100) + ' per $100 staked, ' + esc(r.label) + ' (' + (r.expectedReturn === null ? '—' : (r.expectedReturn * 100).toFixed(3) + '%') + ')</dd>' +
        '<dt>Presenter\'s cutoff</dt><dd>' + esc(E.formatAmerican(r.presenterCutoff)) + ': this price is ' + (r.meetsPresenterCutoff ? 'at or better than' : 'shorter than') + ' it</dd>' +
        '<dt>Price updated</dt><dd>' + esc(fmtStamp(sel.lastUpdate)) + ' (' + esc(ago(r.priceAgeMinutes)) + ')' + (r.isStale ? ' <span class="verdict unknown">Stale</span>' : '') + '</dd>' +
        '</dl>'
    }
    var rule = state.settings.priceRule === 'cutoff' ? 'at or better than −670' : 'positive expected return at the assumed probability'
    return ruleBlock(r, 'Price comparison', 'Compare the exact Over 1.5 match-total price with the claimed 87% hit rate; about −670 is his cutoff.',
      body + '<div class="hint">Pass rule in use: ' + esc(rule) + '. A feed listing does not confirm the market is open to a Maine account; check it in ' + esc(bookName(raw.bookmakerKey)) + '.</div>' + sourceLine(raw, 'odds'))
  }

  function ticketHtml(res) {
    var raw = state.raws.filter(function (x) { return x.fixture.id === res.fixture.id })[0]
    var fx = res.fixture
    var isOpen = !!state.open[fx.id]
    var errors = raw.errors && raw.errors.length ? '<div class="rule unknown"><h3>Failed requests</h3><ul>' + raw.errors.map(function (e) { return '<li>' + esc(e.message) + '</li>' }).join('') + '</ul></div>' : ''
    var match = res.match && res.match.status === 'matched'
      ? '<div class="hint">Odds event matched ' + (res.match.manual ? 'by you' : 'automatically (names ' + Math.round((res.match.confidence || 0) * 100) + '% similar, kickoff within ' + Math.round(res.match.timeDiffMin || 0) + ' min)') + '.</div>'
      : '<div class="hint">Odds event: ' + esc(res.match ? res.match.reason : 'not matched') + '.</div>'
    var evidence = isOpen
      ? '<div class="evidence">' + rule1Html(res.rules[0], raw) + rule2Html(res.rules[1], raw) + rule3Html(res.rules[2], raw) + rule4Html(res.rules[3], raw) + match + errors + '</div>'
      : '<div class="evidence" data-lazy="1"></div>'
    return '<details class="ticket" data-fixture="' + fx.id + '"' + (isOpen ? ' open' : '') + '><summary>' +
      '<div class="ko">' + esc(fmtTime(fx.ts)) + '<small>' + esc(fmtDay(fx.ts)) + '</small></div>' +
      '<div class="teams"><div class="names">' + esc(fx.homeName) + '<span class="v">v</span>' + esc(fx.awayName) + '</div><div class="comp">' + esc(fx.leagueName) + (fx.country ? ' · ' + esc(fx.country) : '') + '</div></div>' +
      '<div class="right">' + pipRow(res.rules) + priceTag(res.rules[3]) + '</div>' +
      '<div class="why">' + esc(res.reasons[0] || '') + '</div>' +
      '</summary>' + evidence + '</details>'
  }

  function renderResults() {
    var all = evaluated()
    var groups = { pass: [], fail: [], unknown: [] }
    all.forEach(function (r) { groups[r.verdict].push(r) })
    var empty = state.raws.length === 0
    ;[['pass', 'lPass', 'cPass'], ['fail', 'lFail', 'cFail'], ['unknown', 'lUnknown', 'cUnknown']].forEach(function (g) {
      $(g[2]).textContent = groups[g[0]].length
      $(g[1]).innerHTML = groups[g[0]].length
        ? '<div class="group">' + groups[g[0]].map(ticketHtml).join('') + '</div>'
        : '<div class="empty">' + (empty ? (IS_VIEWER ? 'Open a saved scan to review it here.' : 'Choose a date and press Scan.') : 'None.') + '</div>'
    })
    $('exportCsv').disabled = empty
    $('exportJson').disabled = empty || IS_VIEWER && !state.imported
  }

  function stat(n, label) { return '<div class="stat"><b>' + esc(n) + '</b><span>' + esc(label) + '</span></div>' }

  function renderStats() {
    var s = state.summary
    var q = s && s.quota ? s.quota : state.client ? state.client.quota : null
    var unmatched = s ? s.unmatched.length : 0
    var failures = state.log.filter(function (e) { return e.error }).length
    $('stats').innerHTML =
      stat(s ? s.fixturesTotal : '—', 'fixtures on date') +
      stat(s ? s.fixturesUpcoming : '—', 'not yet started') +
      stat(s ? state.raws.length + (state.running ? ' / ' + state.plannedCount : '') : '—', 'screened') +
      stat(s ? state.plannedCount - unmatched : '—', 'matched to odds') +
      stat(s ? unmatched : '—', 'unmatched') +
      stat(s ? failures : '—', 'failed requests') +
      stat(q && q.football.dayRemaining !== null ? q.football.dayRemaining : '—', 'API-Football left today') +
      stat(q && q.odds.remaining !== null ? q.odds.remaining : '—', 'Odds API credits left')
  }

  function renderProgress() {
    var p = state.progress
    var box = $('progressBox')
    $('scanBtn').disabled = state.running || IS_VIEWER
    $('stopBtn').disabled = !state.running
    if (!p && !state.fatal) { box.hidden = true; return }
    box.hidden = false
    var fill = $('progressFill')
    if (state.fatal) {
      fill.className = 'fill'
      fill.style.width = '0%'
      $('progressText').textContent = state.fatal
      return
    }
    var label = { fixtures: 'Fetching fixtures…', events: 'Fetching odds events' + (p.label ? ' (' + p.label + ')' : '') + '…', matches: 'Screening ' + (p.done + 1) + ' of ' + p.total + (p.label ? ': ' + p.label : ''), done: 'Scan finished ' + (state.summary && state.summary.finishedAt ? fmtStamp(state.summary.finishedAt) : '') }[p.phase] || ''
    if (state.summary && state.summary.stoppedReason) label = 'Stopped: ' + state.summary.stoppedReason
    $('progressText').textContent = label
    if (p.phase === 'matches' || p.phase === 'done') {
      fill.className = 'fill'
      fill.style.width = (p.total ? Math.round(((p.phase === 'done' ? p.total : p.done) / p.total) * 100) : 100) + '%'
    } else {
      fill.className = 'fill indeterminate'
      fill.style.width = ''
    }
  }

  function renderCoverage() {
    var s = state.summary
    if (!s) { $('coverageBody').innerHTML = '<p class="muted">Run a scan, or open a saved one, to see coverage.</p>'; return }
    var parts = []
    parts.push('<p>Scan of <strong>' + esc(s.date) + '</strong> (' + esc(s.timezone) + ') for <strong>' + esc(bookName(s.bookmakerKey)) + '</strong>, started ' + esc(fmtStamp(s.startedAt)) + (s.finishedAt ? ', finished ' + esc(fmtStamp(s.finishedAt)) : '') + '. Coverage is limited to what both providers carry on your plans. It is not every match a sportsbook offers.</p>')
    if (s.fatal) parts.push('<div class="notice warn"><strong>The scan could not finish.</strong><span>' + esc(s.fatal) + '</span></div>')
    if (s.stoppedReason) parts.push('<p><strong>Stopped:</strong> ' + esc(s.stoppedReason) + '</p>')
    if (s.notScanned && s.notScanned.length) parts.push('<h3>Not scanned (' + s.notScanned.length + ')</h3><ul>' + s.notScanned.map(function (n) { return '<li>' + esc(n.home) + ' v ' + esc(n.away) + ': ' + esc(n.reason) + '</li>' }).join('') + '</ul>')
    if (s.unmappedCompetitions.length) parts.push('<h3>Competitions without an odds mapping</h3><ul>' + s.unmappedCompetitions.map(function (u) { return '<li>' + esc(u.name) + (u.country ? ' (' + esc(u.country) + ')' : '') + ': ' + u.count + ' fixture(s)</li>' }).join('') + '</ul>')
    if (s.inactiveCompetitions.length) parts.push('<h3>Mapped, but no active odds market now</h3><p class="mono small">' + esc(s.inactiveCompetitions.join(', ')) + '</p>')
    if (s.unmatched.length) {
      parts.push('<h3>Fixtures not matched to an odds event (' + s.unmatched.length + ')</h3><p class="hint">Goalmark does not guess. If a candidate is clearly the same match, confirm it to fetch its price.</p><ul>' + s.unmatched.map(function (u) {
        var cands = (u.candidates || []).map(function (c) {
          return '<div class="row small"><span>' + esc(c.home) + ' v ' + esc(c.away) + ' · ' + esc(fmtStamp(c.commence)) + '</span>' + (IS_VIEWER ? '' : '<button class="btn small" type="button" data-confirm-fixture="' + u.fixtureId + '" data-event="' + esc(c.id) + '" data-home="' + esc(c.home) + '" data-away="' + esc(c.away) + '" data-commence="' + esc(c.commence) + '">This is the same match</button>') + '</div>'
        }).join('')
        return '<li><strong>' + esc(u.home) + ' v ' + esc(u.away) + '</strong> <span class="muted">' + esc(u.competition) + '</span>: ' + esc(u.reason) + cands + '</li>'
      }).join('') + '</ul>')
    }
    if (s.failures.length) parts.push('<h3>Failed requests (' + s.failures.length + ')</h3><ul>' + s.failures.map(function (f) { return '<li><strong>' + esc(f.provider) + '</strong> · ' + esc(f.where) + ': ' + esc(f.message) + '</li>' }).join('') + '</ul>')
    if (s.sources.length) parts.push('<h3>Sources</h3><ul>' + s.sources.map(function (x) { return '<li>' + esc(x.what) + ': ' + esc(x.source) + ', ' + esc(fmtStamp(x.at)) + '</li>' }).join('') + '<li>Per-match sources and times are inside each match.</li></ul>')
    var q = s.quota || (state.client && state.client.quota)
    if (q) parts.push('<h3>Quota</h3><dl class="kv"><dt>API-Football today</dt><dd>' + esc(q.football.dayRemaining === null ? 'unknown' : q.football.dayRemaining + (q.football.dayLimit ? ' of ' + q.football.dayLimit : '') + ' left') + '</dd><dt>API-Football this minute</dt><dd>' + esc(q.football.minuteRemaining === null ? 'unknown' : q.football.minuteRemaining + ' left') + '</dd><dt>The Odds API</dt><dd>' + esc(q.odds.remaining === null ? 'unknown' : q.odds.remaining + ' credits left, ' + q.odds.used + ' used') + '</dd></dl>')
    if (state.log.length) parts.push('<h3>Requests (' + state.log.length + ')</h3><div class="log">' + state.log.slice(-200).map(function (e) { return '<div class="' + (e.error ? 'err' : '') + '">' + esc(e.at.slice(11, 19)) + ' ' + esc(e.status === null ? '---' : e.status) + ' ' + esc(e.path) + (e.ms !== null ? ' ' + e.ms + 'ms' : '') + (e.error ? ' · ' + esc(e.error) : '') + '</div>' }).join('') + '</div>')
    $('coverageBody').innerHTML = parts.join('')
  }

  function renderImportNotice() {
    var box = $('importNotice')
    if (!state.imported) { box.hidden = true; return }
    box.hidden = false
    box.innerHTML = '<strong>Saved scan from ' + esc(fmtStamp(new Date(state.imported.savedAt).toISOString())) + '. These are not live matches or prices.</strong>' +
      '<label class="hint" style="display:flex;gap:8px"><input type="checkbox" id="asOfSave"' + (state.imported.asOfSave ? ' checked' : '') + '> Judge price staleness as of when the scan was saved (off: as of now, so old prices read Unknown)</label>'
    $('asOfSave').addEventListener('change', function (e) { state.imported.asOfSave = e.target.checked; renderAll() })
  }

  function renderAll() {
    renderConn()
    renderStats()
    renderProgress()
    renderResults()
    renderCoverage()
    renderImportNotice()
  }

  // ---------- Scan ----------
  function clientConn() {
    var c = state.conn
    return { mode: c.mode, relayBase: c.relayBase, relayToken: c.relayToken, footballKey: c.footballKey, oddsKey: c.oddsKey }
  }

  function makeClient() {
    return S.createClient(clientConn(), {
      fetch: window.fetch.bind(window),
      footballPerMinute: state.settings.footballPerMinute,
      onRequest: function (e) { state.log.push(e); renderSoon() },
    })
  }

  async function startScan() {
    if (IS_VIEWER || state.running) return
    if (state.conn.mode === 'direct' && (!state.conn.footballKey || !state.conn.oddsKey)) { openSetup(); return }
    var date = $('scanDate').value
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { $('progressBox').hidden = false; $('progressText').textContent = 'Choose a date first.'; return }
    state.running = true
    state.fatal = null
    state.imported = null
    state.raws = []
    state.summary = null
    state.plannedCount = 0
    state.log = []
    state.open = {}
    state.controller = new AbortController()
    state.client = makeClient()
    state.progress = { phase: 'fixtures', done: 0, total: 0 }
    renderAll()
    try {
      var out = await S.runScan({
        client: state.client,
        date: date,
        timezone: tz,
        competitions: state.competitions,
        includeUnmapped: state.includeUnmapped,
        bookmakerKey: state.bookmakerKey,
        settings: state.settings,
        pricesOnlyForCandidates: state.settings.pricesOnlyForCandidates !== false,
        signal: state.controller.signal,
        onPlan: function (plan, summary) { state.plannedCount = plan.length; state.summary = summary; renderSoon() },
        onResult: function (raw) { state.raws.push(raw); renderSoon() },
        onProgress: function (p) { state.progress = p; renderProgress() },
      })
      state.summary = out.summary
      state.conn.tested = true
    } catch (err) {
      state.fatal = err.kind === 'aborted' ? 'Stopped before any fixtures were screened.' : (err.provider ? err.provider + ': ' : '') + err.message
      if (err.kind === 'auth' || err.kind === 'network' || err.kind === 'setup') state.conn.tested = false
      if (state.summary) state.summary.fatal = state.fatal
    }
    state.running = false
    state.controller = null
    renderAll()
  }

  function stopScan() {
    if (state.controller) state.controller.abort()
  }

  async function confirmMatch(btn) {
    var fid = Number(btn.getAttribute('data-confirm-fixture'))
    var raw = state.raws.filter(function (r) { return r.fixture.id === fid })[0]
    if (!raw) return
    raw.match = { status: 'matched', manual: true, event: { id: btn.getAttribute('data-event'), home_team: btn.getAttribute('data-home'), away_team: btn.getAttribute('data-away'), commence_time: btn.getAttribute('data-commence') } }
    state.summary.unmatched = state.summary.unmatched.filter(function (u) { return u.fixtureId !== fid })
    state.plannedCount = state.plannedCount
    btn.disabled = true
    if (!raw.sportKey) { raw.oddsError = 'No odds competition for this fixture'; renderAll(); return }
    try {
      if (!state.client) state.client = makeClient()
      await S.fetchOdds(state.client, raw)
    } catch (err) {
      raw.oddsError = (err.provider ? err.provider + ': ' : '') + err.message
    }
    state.open[fid] = true
    renderAll()
  }

  // ---------- Export / import ----------
  async function offerFile(filename, text, mime) {
    var msg = $('exportMsg')
    if (IS_VIEWER) {
      try {
        var downloads = window.claude && window.claude.use ? await window.claude.use('downloads') : null
        if (!downloads) { msg.textContent = 'Saving files is not available in this view.'; return }
        await downloads.save({ filename: filename, data: text })
        msg.textContent = 'Saved ' + filename + '.'
      } catch (err) {
        msg.textContent = err && err.code === 'declined' ? 'Save cancelled.' : 'Could not save the file' + (err && err.message ? ': ' + err.message : '.')
      }
      return
    }
    var blob = new Blob([text], { type: mime })
    var a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    document.body.appendChild(a)
    a.click()
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove() }, 1000)
    msg.textContent = 'Saved ' + filename + '.'
  }

  function exportName(ext) {
    var s = state.summary
    return 'goalmark-' + (s ? s.date : today()) + '-' + (s ? s.bookmakerKey : state.bookmakerKey) + '.' + ext
  }

  function exportCsv() { offerFile(exportName('csv'), E.toCSV(evaluated()), 'text/csv') }

  function exportJson() {
    var doc = { format: 'goalmark-scan', version: 1, savedAt: state.imported ? state.imported.savedAt : Date.now(), settings: state.settings, summary: state.summary, raws: state.raws, log: state.log.slice(-500) }
    offerFile(exportName('json'), JSON.stringify(doc), 'application/json')
  }

  function importFile(file) {
    var reader = new FileReader()
    reader.onload = function () {
      try {
        var doc = JSON.parse(String(reader.result))
        if (!doc || doc.format !== 'goalmark-scan' || !Array.isArray(doc.raws)) throw new Error('This is not a Goalmark scan file.')
        stopScan()
        state.raws = doc.raws
        state.summary = doc.summary || null
        state.plannedCount = doc.raws.length
        state.log = doc.log || []
        state.imported = { savedAt: Number(doc.savedAt) || Date.now(), asOfSave: true }
        state.progress = null
        state.fatal = null
        state.open = {}
        $('exportMsg').textContent = 'Opened ' + file.name + '.'
        renderAll()
      } catch (err) {
        $('exportMsg').textContent = 'Could not open the file: ' + err.message
      }
    }
    reader.readAsText(file)
  }

  // ---------- Setup dialog ----------
  function openSetup() {
    var c = state.conn
    Array.prototype.forEach.call(document.querySelectorAll('input[name="mode"]'), function (r) { r.checked = r.value === c.mode })
    $('relayBase').value = c.relayBase
    $('relayToken').value = c.relayToken
    $('footballKey').value = c.footballKey
    $('oddsKey').value = c.oddsKey
    $('rememberKeys').checked = c.remember
    $('testResult').textContent = IS_VIEWER ? 'Connections cannot be tested inside claude.ai; run the standalone app.' : ''
    syncModeFields()
    var d = $('setup')
    if (typeof d.showModal === 'function') d.showModal()
    else d.setAttribute('open', '')
  }

  function syncModeFields() {
    var mode = (document.querySelector('input[name="mode"]:checked') || {}).value || 'relay'
    $('relayFields').hidden = mode !== 'relay'
    $('directFields').hidden = mode !== 'direct'
  }

  function readSetup() {
    return {
      mode: (document.querySelector('input[name="mode"]:checked') || {}).value || 'relay',
      relayBase: $('relayBase').value.trim() || defaultRelayBase(),
      relayToken: $('relayToken').value.trim(),
      footballKey: $('footballKey').value.trim(),
      oddsKey: $('oddsKey').value.trim(),
      remember: $('rememberKeys').checked,
      tested: null,
    }
  }

  function saveConn() {
    state.conn = readSetup()
    var c = state.conn
    store.set('goalmark.conn', c.remember ? c : { mode: c.mode, relayBase: c.relayBase, remember: false })
    $('setup').close ? $('setup').close() : $('setup').removeAttribute('open')
    renderConn()
  }

  async function testConn() {
    var out = $('testResult')
    if (IS_VIEWER) { out.textContent = 'Connections cannot be tested inside claude.ai; run the standalone app.'; return }
    var c = readSetup()
    out.textContent = 'Testing…'
    try {
      if (c.mode === 'relay') {
        var headers = { 'x-goalmark-client': '1' }
        if (c.relayToken) headers['x-goalmark-token'] = c.relayToken
        var res = await fetch(c.relayBase.replace(/\/$/, '') + '/status', { headers: headers })
        var body = await res.json().catch(function () { return {} })
        if (!res.ok) throw new Error(body.message || 'HTTP ' + res.status)
        out.textContent = 'Relay reached. API-Football key ' + (body.football ? 'set' : 'MISSING') + ', Odds API key ' + (body.odds ? 'set' : 'MISSING') + '.'
        state.conn.tested = !!(body.football && body.odds)
      } else {
        var client = S.createClient(c, { fetch: window.fetch.bind(window), footballPerMinute: 1000 })
        var f = await client.football('/status', {})
        var acct = f.body && f.body.response && f.body.response.requests ? ' (' + f.body.response.requests.current + ' of ' + f.body.response.requests.limit_day + ' requests used today)' : ''
        await client.odds('/v4/sports', {})
        out.textContent = 'Both providers answered' + acct + '. Odds API credits left: ' + (client.quota.odds.remaining === null ? 'unknown' : client.quota.odds.remaining) + '.'
        state.conn.tested = true
      }
    } catch (err) {
      out.textContent = 'Failed: ' + (err.provider ? err.provider + ': ' : '') + err.message
      state.conn.tested = false
    }
    renderConn()
  }

  // ---------- Settings ----------
  function saveSettings() {
    store.set('goalmark.settings', state.settings)
    renderAll()
  }

  function numberSetting(id, key, scale, min, max) {
    $(id).addEventListener('change', function (e) {
      var v = Number(e.target.value)
      if (!isFinite(v)) return renderSettings()
      v = Math.min(max, Math.max(min, v))
      state.settings[key] = scale ? v / scale : Math.round(v)
      renderSettings()
      saveSettings()
    })
  }

  // ---------- Wire up ----------
  function init() {
    $('scanDate').value = today()
    $('tzHint').textContent = 'Kickoff times in ' + tz
    renderBuildNotice()
    renderBooks()
    renderComps()
    renderSettings()
    renderAll()

    $('openSetup').addEventListener('click', openSetup)
    $('saveConn').addEventListener('click', saveConn)
    $('testConn').addEventListener('click', testConn)
    Array.prototype.forEach.call(document.querySelectorAll('input[name="mode"]'), function (r) { r.addEventListener('change', syncModeFields) })
    $('scanBtn').addEventListener('click', startScan)
    $('stopBtn').addEventListener('click', stopScan)
    $('exportCsv').addEventListener('click', exportCsv)
    $('exportJson').addEventListener('click', exportJson)
    $('importFile').addEventListener('change', function (e) { if (e.target.files && e.target.files[0]) importFile(e.target.files[0]); e.target.value = '' })

    $('bookSeg').addEventListener('change', function (e) {
      if (e.target.name !== 'book') return
      state.bookmakerKey = e.target.value
      store.set('goalmark.book', state.bookmakerKey)
      if (state.raws.length && !state.imported) $('progressText').textContent = 'Sportsbook changed: scan again for its prices.'
    })
    $('compList').addEventListener('change', function () {
      var ids = Array.prototype.map.call(document.querySelectorAll('#compList input:checked'), function (i) { return Number(i.getAttribute('data-league')) })
      state.competitions = ids.length === S.LEAGUE_MAP.length ? null : ids
      store.set('goalmark.comps', state.competitions)
      renderComps()
    })
    $('compAll').addEventListener('click', function () { state.competitions = null; store.set('goalmark.comps', null); renderComps() })
    $('compNone').addEventListener('click', function () { state.competitions = []; store.set('goalmark.comps', []); renderComps() })
    $('includeUnmapped').addEventListener('change', function (e) { state.includeUnmapped = e.target.checked })

    numberSetting('sAssumed', 'assumedWinProb', 100, 50, 99.9)
    numberSetting('sWindow', 'h2hWindow', 0, 3, 30)
    numberSetting('sMinSample', 'h2hMinSample', 0, 1, 30)
    numberSetting('sSeasonMin', 'seasonMinPlayed', 0, 1, 20)
    numberSetting('sStale', 'staleOddsMinutes', 0, 1, 720)
    numberSetting('sRpm', 'footballPerMinute', 0, 1, 450)
    $('sCandidatesOnly').addEventListener('change', function (e) { state.settings.pricesOnlyForCandidates = e.target.checked; saveSettings() })
    Array.prototype.forEach.call(document.querySelectorAll('input[name="priceRule"]'), function (r) {
      r.addEventListener('change', function (e) { state.settings.priceRule = e.target.value; saveSettings() })
    })
    $('resetSettings').addEventListener('click', function () { store.del('goalmark.settings'); state.settings = loadSettings(); renderSettings(); renderAll() })

    // Evidence is built when a match is opened, and kept open across re-renders.
    document.addEventListener('toggle', function (e) {
      var d = e.target
      if (!d.classList || !d.classList.contains('ticket')) return
      var id = Number(d.getAttribute('data-fixture'))
      var wasOpen = !!state.open[id]
      state.open[id] = d.open
      if (d.open && !wasOpen) renderResults()
    }, true)
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('[data-confirm-fixture]')
      if (btn) confirmMatch(btn)
    })

    // Prices age while the page is open: re-judge staleness every minute.
    setInterval(function () { if (state.raws.length && !state.running) renderResults() }, 60000)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
  else init()
})()
