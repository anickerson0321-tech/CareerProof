# Notes for Claude

## Goalmark scans (goalmark/)

The owner runs Goalmark by asking in chat, e.g. "scan Saturday's matches" or "scan today on Caesars". To do that:

1. Needs `GOALMARK_APIFOOTBALL_KEY` and `GOALMARK_ODDSAPI_KEY` in the environment, and network access to `v3.football.api-sports.io` and `api.the-odds-api.com`. If either is missing, say so plainly and point to the environment settings. Never ask for keys in chat.
2. Run `node goalmark/build.mjs`, then `node goalmark/scan-cli.mjs --date YYYY-MM-DD --book draftkings` (or `williamhill_us` for Caesars). Dates are the owner's local day; default timezone is America/New_York.
3. Republish the page so it shows the new scan: Artifact publish `goalmark/dist/artifact.html` with `url: https://claude.ai/artifact/MTC4HYkUyUxQLbf4UYxtgu` and `files: { "latest-scan.json": "goalmark/dist/latest-scan.json" }`.
4. Reply in plain language: which matches pass all four checks with their Over 1.5 price, how many failed or need more data, and quota left. Remind them the 87% figure is the presenter's unverified claim, and to confirm the market in their Maine sportsbook app. Never place bets.

The owner is not technical: avoid terminal instructions; do the steps yourself.
