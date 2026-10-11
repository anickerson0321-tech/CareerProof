# Goalmark

Goalmark screens upcoming soccer matches for the over 1.5 total match goals strategy: at least two combined goals in regulation time, stoppage time included. It applies four rules and shows the evidence behind each one. It never places bets.

| # | Rule (presenter, as specified) | How Goalmark checks it |
| - | - | - |
| 1 | Both teams average at least 1.0 goals scored per game this season | Regulation-time goals in the fixture's own competition and season, completed matches before kickoff. Shows goals, matches played, average and competition. App minimum: 3 matches. |
| 2 | More than 80% of previous meetings had over 1.5 combined goals | Latest 10 meetings, minimum 5 usable. Both are **app settings**; the video does not define them. Shows every meeting, the qualifying count, sample size and percentage. |
| 3 | Each team scored in at least 4 of its last 5 completed matches | All competitions, from each team's last 10 fixtures, before kickoff. Each team's own goals count; both teams need not score in the same match. |
| 4 | Price vs the presenter's claimed 87% hit rate (about −670) | The exact Over 1.5 full-match price from `totals`/`alternate_totals` at the chosen book. Shows exact implied probability, the break-even price and expected return, all labelled "assuming an X% win probability" (default 87%, adjustable). |

Missing, stale or too-thin data gives **Unknown**, never a pass. Extra-time goals and shoot-out penalties are never counted.

## Run it

You need an [API-Football](https://www.api-football.com/) key and a [The Odds API](https://the-odds-api.com/) key.

```
node goalmark/build.mjs
GOALMARK_APIFOOTBALL_KEY=... GOALMARK_ODDSAPI_KEY=... node goalmark/server.mjs
```

Open http://127.0.0.1:8787. The relay keeps both keys in its environment, never in the browser, the request log or the source. You can also put them in `goalmark/.env` (git-ignored) as `KEY=VALUE` lines.

To use it from a phone on the same Wi-Fi, start the relay with `HOST=0.0.0.0 GOALMARK_ACCESS_TOKEN=<long secret>`, open `http://<computer-ip>:8787`, and enter the token under Data connections.

Without the relay, Data connections also accepts both keys directly in the browser. A provider may refuse browser requests (CORS).

The copy published on claude.ai can't reach either provider. Use it to review a scan saved here with **Save scan (JSON)**.

## Maine sportsbooks

On 2026-10-11, the [Maine Gambling Control Unit's sports wagering page](https://www.maine.gov/dps/gcu/sports-wagering) listed DraftKings and Caesars Sportsbook as mobile operators. That was checked through the page's search listing. Re-verify before relying on it. The Odds API keys are `draftkings` and `williamhill_us` (Caesars). A feed price is a listing, not confirmation that the market is open to a Maine account.

## Tests

```
node --test goalmark/test/*.test.mjs
```

The tests cover odds conversion, threshold boundaries (8/10 vs 9/10, 4/5, exactly 1.0, −670 vs −669, exact break-even), missing data, the historical cutoff, regulation-only scores, exact market selection, cross-provider matching, quota stops, key handling and the relay's allowlist.
