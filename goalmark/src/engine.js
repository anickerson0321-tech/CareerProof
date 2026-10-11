/*
 * Goalmark screening engine. Pure functions only: no network, no DOM.
 * Loaded as a plain script in the browser (window.GoalmarkEngine) and with
 * require() in Node tests.
 *
 * Rules (from the user's specification of the presenter's strategy, market
 * "over 1.5 total match goals", regulation time including stoppage time):
 *   1. Both teams average >= 1.0 goals scored per game this season.
 *   2. More than 80% of previous meetings had over 1.5 combined goals.
 *   3. Each team scored in at least 4 of its last 5 completed matches.
 *   4. The over 1.5 price compared with the presenter's claimed 87% hit rate
 *      (about -670 as his cutoff).
 * Anything the presenter did not define (history window, minimum samples,
 * staleness) is an app setting, labelled as such in the interface.
 */
(function (root) {
  'use strict'

  var COMPLETED = { FT: true, AET: true, PEN: true }
  var UPCOMING = { NS: true, TBD: true }

  var DEFAULT_SETTINGS = {
    // Presenter rules (as specified)
    seasonAvgThreshold: 1.0,
    h2hThresholdPct: 80,
    formWindow: 5,
    formMinScored: 4,
    presenterClaimProb: 0.87,
    presenterCutoff: -670,
    // App settings (not stated by the presenter)
    h2hWindow: 10,
    h2hMinSample: 5,
    seasonMinPlayed: 3,
    assumedWinProb: 0.87,
    priceRule: 'ev', // 'ev': positive expected return at the assumed probability; 'cutoff': at or better than presenterCutoff
    staleOddsMinutes: 30,
    matchKickoffToleranceMinutes: 15,
    matchNameThreshold: 0.8,
  }

  function withDefaults(settings) {
    var out = {}
    for (var k in DEFAULT_SETTINGS) out[k] = DEFAULT_SETTINGS[k]
    if (settings) for (var j in settings) if (settings[j] !== undefined && settings[j] !== null && settings[j] !== '') out[j] = settings[j]
    return out
  }

  // ---------- Fixtures ----------

  /** Flattens an API-Football v3 fixture into the fields the rules use. */
  function fromApiFootball(raw) {
    var f = raw.fixture || {}
    var l = raw.league || {}
    var t = raw.teams || {}
    var g = raw.goals || {}
    var s = raw.score || {}
    var ft = s.fulltime || {}
    var et = s.extratime || {}
    var pen = s.penalty || {}
    return {
      id: f.id,
      ts: typeof f.timestamp === 'number' ? f.timestamp : Math.floor(Date.parse(f.date) / 1000),
      date: f.date,
      status: (f.status && f.status.short) || '',
      leagueId: l.id,
      leagueName: l.name,
      country: l.country,
      season: l.season,
      round: l.round,
      homeId: t.home && t.home.id,
      homeName: t.home && t.home.name,
      awayId: t.away && t.away.id,
      awayName: t.away && t.away.name,
      goalsHome: g.home,
      goalsAway: g.away,
      ftHome: ft.home,
      ftAway: ft.away,
      etHome: et.home,
      etAway: et.away,
      penHome: pen.home,
      penAway: pen.away,
    }
  }

  function isCompleted(fx) {
    return !!COMPLETED[fx.status]
  }

  function isUpcoming(fx, nowSec) {
    return !!UPCOMING[fx.status] && fx.ts > nowSec
  }

  var isNum = function (v) { return typeof v === 'number' && isFinite(v) }

  /**
   * The score at the end of regulation time (90 minutes plus stoppage time).
   * API-Football's score.fulltime holds that score; extra-time goals and
   * shoot-out penalties are reported separately and are never counted.
   * Returns null when the regulation score is not available.
   */
  function regulationScore(fx) {
    if (!isCompleted(fx)) return null
    if (isNum(fx.ftHome) && isNum(fx.ftAway)) return { home: fx.ftHome, away: fx.ftAway }
    // Only a match decided in 90 minutes can fall back to the final score.
    if (fx.status === 'FT' && isNum(fx.goalsHome) && isNum(fx.goalsAway)) return { home: fx.goalsHome, away: fx.goalsAway }
    return null
  }

  /** Completed fixtures that kicked off before the cutoff (seconds), newest first. */
  function completedBefore(fixtures, cutoffSec) {
    return fixtures
      .filter(function (fx) { return isCompleted(fx) && fx.ts < cutoffSec })
      .sort(function (a, b) { return b.ts - a.ts })
  }

  function teamGoals(fx, teamId, reg) {
    if (fx.homeId === teamId) return reg.home
    if (fx.awayId === teamId) return reg.away
    return null
  }

  function opponentName(fx, teamId) {
    return fx.homeId === teamId ? fx.awayName : fx.homeName
  }

  // ---------- Rule 1: season scoring averages ----------

  function seasonAverage(teamId, teamName, fixtures, opts) {
    var games = completedBefore(fixtures, opts.cutoffSec).filter(function (fx) {
      return fx.leagueId === opts.leagueId && fx.season === opts.season && (fx.homeId === teamId || fx.awayId === teamId)
    })
    var goals = 0
    var played = 0
    var excluded = []
    games.forEach(function (fx) {
      var reg = regulationScore(fx)
      if (reg === null) {
        excluded.push({ id: fx.id, date: fx.date, reason: 'No regulation-time score' })
        return
      }
      goals += teamGoals(fx, teamId, reg)
      played += 1
    })
    return {
      teamId: teamId,
      teamName: teamName,
      goals: goals,
      played: played,
      average: played > 0 ? goals / played : null,
      competition: opts.leagueName + ' ' + seasonLabel(opts.season),
      excluded: excluded,
    }
  }

  function seasonLabel(season) {
    return isNum(season) ? season + '/' + String((season + 1) % 100).padStart(2, '0') : String(season)
  }

  function evalRule1(home, away, settings) {
    var s = withDefaults(settings)
    var teams = [home, away]
    var reasons = []
    var status = 'pass'
    teams.forEach(function (t) {
      if (t === null || t === undefined) {
        status = status === 'fail' ? 'fail' : 'unknown'
        reasons.push('Season data missing')
        return
      }
      if (t.played < s.seasonMinPlayed || t.average === null) {
        if (status !== 'fail') status = 'unknown'
        reasons.push(t.teamName + ': only ' + t.played + ' completed match(es) in ' + t.competition + ' (app minimum ' + s.seasonMinPlayed + ')')
        return
      }
      if (t.average < s.seasonAvgThreshold) {
        status = 'fail'
        reasons.push(t.teamName + ' averages ' + t.average.toFixed(2) + ' goals per game, below ' + s.seasonAvgThreshold.toFixed(1))
      }
    })
    if (status === 'pass') reasons.push('Both teams average at least ' + s.seasonAvgThreshold.toFixed(1) + ' goals per game')
    var combined = home && away && home.average !== null && away.average !== null ? home.average + away.average : null
    return { rule: 1, status: status, reasons: reasons, home: home, away: away, combinedAverage: combined }
  }

  // ---------- Rule 2: head-to-head ----------

  function evalRule2(meetings, homeId, awayId, cutoffSec, settings) {
    var s = withDefaults(settings)
    if (!meetings) return { rule: 2, status: 'unknown', reasons: ['Head-to-head history not retrieved'], meetings: [], qualifying: 0, sample: 0, pct: null }
    var between = completedBefore(meetings, cutoffSec).filter(function (fx) {
      return (fx.homeId === homeId && fx.awayId === awayId) || (fx.homeId === awayId && fx.awayId === homeId)
    })
    var window = between.slice(0, s.h2hWindow)
    var rows = []
    var qualifying = 0
    var sample = 0
    var excluded = 0
    window.forEach(function (fx) {
      var reg = regulationScore(fx)
      if (reg === null) {
        excluded += 1
        rows.push({ id: fx.id, date: fx.date, home: fx.homeName, away: fx.awayName, score: null, total: null, isOver: null, competition: fx.leagueName, status: fx.status })
        return
      }
      var total = reg.home + reg.away
      var isOver = total >= 2
      sample += 1
      if (isOver) qualifying += 1
      rows.push({ id: fx.id, date: fx.date, home: fx.homeName, away: fx.awayName, score: reg, total: total, isOver: isOver, competition: fx.leagueName, status: fx.status })
    })
    var pct = sample > 0 ? (qualifying / sample) * 100 : null
    var reasons = []
    var status
    if (sample < s.h2hMinSample) {
      status = 'unknown'
      reasons.push('Only ' + sample + ' usable meeting(s) in the latest ' + s.h2hWindow + ' (app minimum ' + s.h2hMinSample + ')')
    } else if (pct > s.h2hThresholdPct) {
      status = 'pass'
      reasons.push(qualifying + ' of ' + sample + ' meetings (' + pct.toFixed(0) + '%) had 2+ goals, more than ' + s.h2hThresholdPct + '%')
    } else {
      status = 'fail'
      reasons.push(qualifying + ' of ' + sample + ' meetings (' + pct.toFixed(0) + '%) had 2+ goals; the rule needs more than ' + s.h2hThresholdPct + '%')
    }
    if (excluded > 0) reasons.push(excluded + ' meeting(s) excluded: no regulation-time score')
    return { rule: 2, status: status, reasons: reasons, meetings: rows, qualifying: qualifying, sample: sample, pct: pct, window: s.h2hWindow, minSample: s.h2hMinSample }
  }

  // ---------- Rule 3: recent scoring form ----------

  function recentForm(teamId, teamName, fixtures, cutoffSec, settings) {
    var s = withDefaults(settings)
    var games = completedBefore(fixtures, cutoffSec).filter(function (fx) { return fx.homeId === teamId || fx.awayId === teamId })
    var rows = []
    var missing = 0
    for (var i = 0; i < games.length && rows.length < s.formWindow; i++) {
      var fx = games[i]
      var reg = regulationScore(fx)
      if (reg === null) {
        missing += 1
        rows.push({ id: fx.id, date: fx.date, opponent: opponentName(fx, teamId), isHome: fx.homeId === teamId, score: null, teamGoals: null, scored: null, competition: fx.leagueName, status: fx.status })
        continue
      }
      var tg = teamGoals(fx, teamId, reg)
      rows.push({ id: fx.id, date: fx.date, opponent: opponentName(fx, teamId), isHome: fx.homeId === teamId, score: reg, teamGoals: tg, scored: tg >= 1, competition: fx.leagueName, status: fx.status })
    }
    var scoredIn = rows.filter(function (r) { return r.scored === true }).length
    var known = rows.filter(function (r) { return r.scored !== null }).length
    var competitions = []
    rows.forEach(function (r) { if (competitions.indexOf(r.competition) === -1) competitions.push(r.competition) })
    return { teamId: teamId, teamName: teamName, rows: rows, scoredIn: scoredIn, known: known, missing: missing, competitions: competitions }
  }

  function evalRule3(homeForm, awayForm, settings) {
    var s = withDefaults(settings)
    var status = 'pass'
    var reasons = []
    ;[homeForm, awayForm].forEach(function (f) {
      if (!f) {
        if (status !== 'fail') status = 'unknown'
        reasons.push('Recent results missing')
        return
      }
      var needToFail = s.formWindow - s.formMinScored + 1
      var blanks = f.known - f.scoredIn
      if (blanks >= needToFail) {
        status = 'fail'
        reasons.push(f.teamName + ' scored in ' + f.scoredIn + ' of its last ' + f.known + ' known matches; needs ' + s.formMinScored + ' of ' + s.formWindow)
        return
      }
      if (f.known < s.formWindow) {
        if (status !== 'fail') status = 'unknown'
        reasons.push(f.teamName + ': only ' + f.known + ' of the last ' + s.formWindow + ' results usable')
        return
      }
      reasons.push(f.teamName + ' scored in ' + f.scoredIn + ' of its last ' + s.formWindow)
    })
    return { rule: 3, status: status, reasons: reasons, home: homeForm, away: awayForm }
  }

  // ---------- Odds ----------

  function americanToDecimal(a) {
    if (!isNum(a) || a === 0 || (a > -100 && a < 100)) return null
    return a > 0 ? 1 + a / 100 : 1 + 100 / -a
  }

  function decimalToAmerican(d) {
    if (!isNum(d) || d <= 1) return null
    return d >= 2 ? (d - 1) * 100 : -100 / (d - 1)
  }

  /** Implied probability of an American price, before removing the bookmaker's margin. */
  function impliedProbability(a) {
    if (!isNum(a) || (a > -100 && a < 100)) return null
    return a < 0 ? -a / (-a + 100) : 100 / (a + 100)
  }

  /** The American price at which a bet with win probability p breaks even. */
  function breakEvenAmerican(p) {
    if (!(p > 0 && p < 1)) return null
    return p >= 0.5 ? -100 * p / (1 - p) : 100 * (1 - p) / p
  }

  /** Expected profit per 1 unit staked, conditional on win probability p. */
  function expectedReturn(a, p) {
    var d = americanToDecimal(a)
    if (d === null || !(p >= 0 && p <= 1)) return null
    return p * (d - 1) - (1 - p)
  }

  var MATCH_TOTAL_MARKETS = { totals: true, alternate_totals: true }

  /**
   * Finds the exact full-match Over 1.5 price for one bookmaker. Only the
   * `totals` and `alternate_totals` markets count (never halves, team totals
   * or Asian lines), the outcome must be "Over" and the point exactly 1.5.
   */
  function selectOver15(event, bookmakerKey) {
    if (!event || !event.bookmakers) return { found: false, reason: 'No odds returned for this event' }
    var book = event.bookmakers.filter(function (b) { return b.key === bookmakerKey })[0]
    if (!book) return { found: false, reason: 'The bookmaker is not listed for this event in the feed' }
    var candidates = []
    ;(book.markets || []).forEach(function (m) {
      if (!MATCH_TOTAL_MARKETS[m.key]) return
      ;(m.outcomes || []).forEach(function (o) {
        if (o.name === 'Over' && o.point === 1.5 && !o.description) candidates.push({ market: m.key, price: o.price, point: o.point, lastUpdate: m.last_update || book.last_update })
      })
    })
    if (candidates.length === 0) {
      var points = []
      ;(book.markets || []).forEach(function (m) {
        if (!MATCH_TOTAL_MARKETS[m.key]) return
        ;(m.outcomes || []).forEach(function (o) { if (o.name === 'Over' && points.indexOf(o.point) === -1) points.push(o.point) })
      })
      return { found: false, reason: points.length > 0 ? 'No Over 1.5 line; lines offered: ' + points.sort(function (a, b) { return a - b }).join(', ') : 'No match total markets for this bookmaker', bookmaker: book.title }
    }
    // Prefer the main totals market when both list 1.5.
    candidates.sort(function (a, b) { return (a.market === 'totals' ? 0 : 1) - (b.market === 'totals' ? 0 : 1) })
    var c = candidates[0]
    var american = c.price
    if (isNum(american) && american > 1 && american < 100) american = decimalToAmerican(american) // feed returned decimal
    var conflicting = candidates.some(function (x) { return x.price !== c.price })
    return { found: true, bookmaker: book.title, bookmakerKey: book.key, market: c.market, point: c.point, american: american, lastUpdate: c.lastUpdate, conflicting: conflicting }
  }

  function evalRule4(selection, settings, nowMs, fetchedAtMs) {
    var s = withDefaults(settings)
    var p = Number(s.assumedWinProb)
    var label = 'assuming a ' + (p * 100).toFixed(1).replace(/\.0$/, '') + '% win probability'
    var base = { rule: 4, label: label, assumedProb: p, presenterCutoff: s.presenterCutoff, breakEvenAmerican: breakEvenAmerican(p), priceRule: s.priceRule }
    if (!selection) return Object.assign(base, { status: 'unknown', reasons: ['Price not retrieved'] })
    if (selection.skipped) return Object.assign(base, { status: 'skipped', reasons: [selection.skipped] })
    if (!selection.found) return Object.assign(base, { status: 'unknown', reasons: [selection.reason], selection: selection })
    var a = selection.american
    var implied = impliedProbability(a)
    var ev = expectedReturn(a, p)
    var updatedMs = Date.parse(selection.lastUpdate)
    var ageMin = isNum(updatedMs) ? (nowMs - updatedMs) / 60000 : null
    var fetchedAgeMin = isNum(fetchedAtMs) ? (nowMs - fetchedAtMs) / 60000 : null
    var result = Object.assign(base, {
      selection: selection,
      american: a,
      decimal: americanToDecimal(a),
      impliedProb: implied,
      expectedReturn: ev,
      edge: implied === null ? null : p - implied,
      priceAgeMinutes: ageMin,
      fetchedAgeMinutes: fetchedAgeMin,
      meetsPresenterCutoff: isNum(a) ? a >= s.presenterCutoff : null,
      isStale: ageMin === null || ageMin > s.staleOddsMinutes || (fetchedAgeMin !== null && fetchedAgeMin > s.staleOddsMinutes),
    })
    if (implied === null) return Object.assign(result, { status: 'unknown', reasons: ['The price could not be read'] })
    if (result.isStale) return Object.assign(result, { status: 'unknown', reasons: ['The price is older than ' + s.staleOddsMinutes + ' minutes; rescan before relying on it'] })
    // A return within floating-point noise of zero is break-even, which is not positive.
    var passes = s.priceRule === 'cutoff' ? a >= s.presenterCutoff : ev > 1e-9
    var reasons = []
    if (s.priceRule === 'cutoff') {
      reasons.push(formatAmerican(a) + (passes ? ' is at or better than ' : ' is shorter than ') + 'the presenter\'s ' + formatAmerican(s.presenterCutoff) + ' cutoff')
    } else {
      reasons.push(formatAmerican(a) + ' implies ' + (implied * 100).toFixed(2) + '%; ' + (passes ? 'below' : 'not below') + ' ' + (p * 100).toFixed(1) + '%, so the expected return is ' + (ev * 100).toFixed(2) + '% per unit, ' + label)
    }
    if (selection.conflicting) reasons.push('The feed listed Over 1.5 at more than one price; the main totals market was used')
    return Object.assign(result, { status: passes ? 'pass' : 'fail', reasons: reasons })
  }

  function formatAmerican(a) {
    if (!isNum(a)) return '—'
    var r = Math.round(a)
    return (r > 0 ? '+' : '−') + Math.abs(r)
  }

  // ---------- Verdict ----------

  function overallVerdict(rules) {
    var statuses = rules.map(function (r) { return r.status })
    if (statuses.indexOf('fail') !== -1) return 'fail'
    if (statuses.every(function (st) { return st === 'pass' })) return 'pass'
    return 'unknown'
  }

  // ---------- Matching across providers ----------

  var STOP_WORDS = ['fc', 'cf', 'afc', 'sc', 'ac', 'cd', 'ud', 'sd', 'rc', 'fk', 'sk', 'bk', 'if', 'ss', 'as', 'us', 'club', 'calcio', 'de', 'the', 'sv', 'vfl', 'vfb', 'tsg', 'cp', 'sl', 'ca', 'cr', 'ec', 'se', 'ssc', 'ogc']
  var ALIASES = {
    'man utd': 'manchester united', 'man united': 'manchester united', 'man city': 'manchester city',
    'spurs': 'tottenham hotspur', 'tottenham': 'tottenham hotspur', 'wolves': 'wolverhampton wanderers',
    'nottm forest': 'nottingham forest', 'brighton': 'brighton and hove albion', 'brighton hove albion': 'brighton and hove albion',
    'west ham': 'west ham united', 'newcastle': 'newcastle united', 'leeds': 'leeds united', 'sheffield utd': 'sheffield united',
    'psg': 'paris saint germain', 'paris sg': 'paris saint germain', 'inter': 'inter milan', 'internazionale': 'inter milan',
    'inter milano': 'inter milan', 'milan': 'ac milan', 'atletico madrid': 'atletico madrid', 'atl madrid': 'atletico madrid',
    'atletico de madrid': 'atletico madrid', 'bayern munich': 'bayern munchen', 'bayern': 'bayern munchen',
    'bayer leverkusen': 'bayer 04 leverkusen', 'leverkusen': 'bayer 04 leverkusen', 'gladbach': 'borussia monchengladbach',
    'monchengladbach': 'borussia monchengladbach', 'dortmund': 'borussia dortmund', 'la galaxy': 'los angeles galaxy',
    'lafc': 'los angeles fc', 'ny red bulls': 'new york red bulls', 'nycfc': 'new york city', 'new york city fc': 'new york city',
    'sporting cp': 'sporting lisbon', 'sporting': 'sporting lisbon', 'benfica': 'sl benfica', 'porto': 'fc porto',
  }

  function normalizeTeamName(name) {
    var t = String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    t = t.replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
    if (ALIASES[t]) t = ALIASES[t]
    var words = t.split(' ').filter(function (w) { return STOP_WORDS.indexOf(w) === -1 })
    t = words.join(' ')
    if (ALIASES[t]) t = ALIASES[t]
    return t
  }

  function bigrams(s) {
    var out = []
    var t = ' ' + s + ' '
    for (var i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2))
    return out
  }

  /** Dice similarity of character bigrams, 0..1; 1 for identical normalized names. */
  function nameSimilarity(a, b) {
    var x = normalizeTeamName(a)
    var y = normalizeTeamName(b)
    if (x.length === 0 || y.length === 0) return 0
    if (x === y) return 1
    var bx = bigrams(x)
    var by = bigrams(y)
    var counts = {}
    bx.forEach(function (g) { counts[g] = (counts[g] || 0) + 1 })
    var hit = 0
    by.forEach(function (g) { if (counts[g] > 0) { hit += 1; counts[g] -= 1 } })
    var dice = (2 * hit) / (bx.length + by.length)
    // One name containing the other whole ("Wolves" -> "Wolverhampton") is strong evidence.
    if ((x.indexOf(y) !== -1 || y.indexOf(x) !== -1) && Math.min(x.length, y.length) >= 4) dice = Math.max(dice, 0.85)
    return dice
  }

  /**
   * Finds the odds-feed event for a fixture. Matched only when kickoff times
   * agree within the tolerance, both team names clear the threshold in the
   * same home/away orientation, and no other event comes close. Otherwise
   * returns the best candidates for the user to confirm by hand.
   */
  function matchEvent(fixture, events, settings) {
    var s = withDefaults(settings)
    var tolSec = s.matchKickoffToleranceMinutes * 60
    var scored = (events || []).map(function (ev) {
      var evTs = Math.floor(Date.parse(ev.commence_time) / 1000)
      var homeSim = nameSimilarity(fixture.homeName, ev.home_team)
      var awaySim = nameSimilarity(fixture.awayName, ev.away_team)
      var swappedSim = Math.min(nameSimilarity(fixture.homeName, ev.away_team), nameSimilarity(fixture.awayName, ev.home_team))
      return { event: ev, homeSim: homeSim, awaySim: awaySim, swappedSim: swappedSim, minSim: Math.min(homeSim, awaySim), timeDiffMin: Math.abs(evTs - fixture.ts) / 60, isTimeOk: Math.abs(evTs - fixture.ts) <= tolSec }
    }).sort(function (a, b) { return b.minSim - a.minSim })
    var good = scored.filter(function (c) { return c.isTimeOk && c.minSim >= s.matchNameThreshold })
    var candidates = scored.filter(function (c) { return c.minSim >= 0.45 || c.swappedSim >= 0.6 }).slice(0, 3)
    if (good.length === 1) {
      var runnerUp = scored.filter(function (c) { return c !== good[0] && c.isTimeOk })[0]
      if (runnerUp && runnerUp.minSim >= good[0].minSim - 0.05) return { status: 'ambiguous', reason: 'Two odds events look alike', candidates: candidates }
      return { status: 'matched', event: good[0].event, confidence: good[0].minSim, timeDiffMin: good[0].timeDiffMin }
    }
    if (good.length > 1) return { status: 'ambiguous', reason: good.length + ' odds events match the names and time', candidates: candidates }
    var swapped = scored.filter(function (c) { return c.isTimeOk && c.swappedSim >= s.matchNameThreshold })
    if (swapped.length > 0) return { status: 'ambiguous', reason: 'Teams match with home and away reversed', candidates: candidates }
    var nameOnly = scored.filter(function (c) { return c.minSim >= s.matchNameThreshold && !c.isTimeOk })
    if (nameOnly.length > 0) return { status: 'unmatched', reason: 'Names match but kickoff differs by ' + Math.round(nameOnly[0].timeDiffMin) + ' min', candidates: candidates }
    return { status: 'unmatched', reason: candidates.length > 0 ? 'No confident name match' : 'No odds event for this fixture', candidates: candidates }
  }

  // ---------- Whole match ----------

  /**
   * Evaluates one fixture from raw evidence. `raw` holds the fixture and what
   * the scan fetched: season fixtures per team, recent fixtures per team,
   * head-to-head meetings and the odds event, each possibly missing.
   */
  function evaluateMatch(raw, settings, nowMs) {
    var s = withDefaults(settings)
    var fx = raw.fixture
    var cutoff = fx.ts
    var opts = { cutoffSec: cutoff, leagueId: fx.leagueId, leagueName: fx.leagueName, season: fx.season }
    var homeSeason = raw.seasonHome ? seasonAverage(fx.homeId, fx.homeName, raw.seasonHome, opts) : null
    var awaySeason = raw.seasonAway ? seasonAverage(fx.awayId, fx.awayName, raw.seasonAway, opts) : null
    var r1 = evalRule1(homeSeason, awaySeason, s)
    var r2 = evalRule2(raw.h2h, fx.homeId, fx.awayId, cutoff, s)
    var r3 = evalRule3(
      raw.recentHome ? recentForm(fx.homeId, fx.homeName, raw.recentHome, cutoff, s) : null,
      raw.recentAway ? recentForm(fx.awayId, fx.awayName, raw.recentAway, cutoff, s) : null,
      s,
    )
    var selection = raw.oddsSkipped ? { skipped: raw.oddsSkipped } : raw.oddsEvent ? selectOver15(raw.oddsEvent, raw.bookmakerKey) : raw.oddsError ? { found: false, reason: raw.oddsError } : null
    var r4 = evalRule4(selection, s, nowMs, raw.oddsFetchedAt)
    var rules = [r1, r2, r3, r4]
    var verdict = overallVerdict(rules)
    var reasons = []
    rules.forEach(function (r) {
      if (verdict === 'fail' && r.status === 'fail') reasons.push('Rule ' + r.rule + ': ' + r.reasons[0])
      if (verdict === 'unknown' && (r.status === 'unknown' || r.status === 'skipped')) reasons.push('Rule ' + r.rule + ': ' + r.reasons[0])
    })
    if (verdict === 'pass') reasons.push('All four checks pass. This is a screen, not proof of profitability.')
    return { fixture: fx, rules: rules, verdict: verdict, reasons: reasons, match: raw.match || null }
  }

  /** Rules 1-3 alone, to decide whether a price is worth a request. */
  function preliminaryVerdict(raw, settings, nowMs) {
    var e = evaluateMatch(Object.assign({}, raw, { oddsSkipped: 'pending', oddsEvent: null }), settings, nowMs)
    return overallVerdict(e.rules.slice(0, 3))
  }

  // ---------- Export ----------

  function csvCell(v) {
    if (v === null || v === undefined) return ''
    var t = String(v)
    return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t
  }

  function toCSV(results) {
    var head = ['kickoff_utc', 'competition', 'home', 'away', 'verdict', 'rule1', 'home_avg', 'away_avg', 'home_played', 'away_played', 'rule2', 'h2h_over', 'h2h_sample', 'h2h_pct', 'rule3', 'home_scored_last5', 'away_scored_last5', 'rule4', 'bookmaker', 'market', 'over15_american', 'implied_prob', 'assumed_prob', 'expected_return_per_unit', 'price_updated', 'reasons']
    var rows = results.map(function (r) {
      var fx = r.fixture
      var r1 = r.rules[0], r2 = r.rules[1], r3 = r.rules[2], r4 = r.rules[3]
      return [
        new Date(fx.ts * 1000).toISOString(), fx.leagueName, fx.homeName, fx.awayName, r.verdict,
        r1.status, r1.home && r1.home.average !== null ? r1.home.average.toFixed(3) : '', r1.away && r1.away.average !== null ? r1.away.average.toFixed(3) : '',
        r1.home ? r1.home.played : '', r1.away ? r1.away.played : '',
        r2.status, r2.qualifying, r2.sample, r2.pct === null ? '' : r2.pct.toFixed(1),
        r3.status, r3.home ? r3.home.scoredIn + '/' + r3.home.known : '', r3.away ? r3.away.scoredIn + '/' + r3.away.known : '',
        r4.status, r4.selection && r4.selection.bookmaker || '', r4.selection && r4.selection.market || '',
        r4.american === undefined ? '' : Math.round(r4.american), r4.impliedProb === undefined || r4.impliedProb === null ? '' : r4.impliedProb.toFixed(5),
        r4.assumedProb, r4.expectedReturn === undefined || r4.expectedReturn === null ? '' : r4.expectedReturn.toFixed(5),
        r4.selection && r4.selection.lastUpdate || '', r.reasons.join(' | '),
      ].map(csvCell).join(',')
    })
    return [head.join(',')].concat(rows).join('\n')
  }

  var api = {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    withDefaults: withDefaults,
    fromApiFootball: fromApiFootball,
    isCompleted: isCompleted,
    isUpcoming: isUpcoming,
    regulationScore: regulationScore,
    completedBefore: completedBefore,
    seasonAverage: seasonAverage,
    seasonLabel: seasonLabel,
    evalRule1: evalRule1,
    evalRule2: evalRule2,
    recentForm: recentForm,
    evalRule3: evalRule3,
    americanToDecimal: americanToDecimal,
    decimalToAmerican: decimalToAmerican,
    impliedProbability: impliedProbability,
    breakEvenAmerican: breakEvenAmerican,
    expectedReturn: expectedReturn,
    selectOver15: selectOver15,
    evalRule4: evalRule4,
    formatAmerican: formatAmerican,
    overallVerdict: overallVerdict,
    normalizeTeamName: normalizeTeamName,
    nameSimilarity: nameSimilarity,
    matchEvent: matchEvent,
    evaluateMatch: evaluateMatch,
    preliminaryVerdict: preliminaryVerdict,
    toCSV: toCSV,
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else root.GoalmarkEngine = api
})(typeof window !== 'undefined' ? window : globalThis)
