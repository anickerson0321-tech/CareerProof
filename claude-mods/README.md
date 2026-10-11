# Claude Code mods

Four Claude Code plugins, published from this repository as the `careerproof-mods` marketplace (`.claude-plugin/marketplace.json` at the repo root).

| Mod | What it does | Command |
| --- | --- | --- |
| **blast-radius** | Intercepts `rm`/`unlink`/`shred`, `find -delete`, `xargs rm`, `git reset --hard`, `git clean -f`, `git checkout --`/`restore`, `git stash drop/clear`, `git branch -D`, force pushes, and overwrites (`>` redirects, `tee`, `dd`, `truncate`, `sed -i`, `mv`/`cp` onto existing files, `Write` onto an existing file). Lists every affected file (dry-running git and find where it can), then asks you to confirm before anything runs. A refusal, a dismissed dialog or a failed check blocks the call. | `/blast-radius [pause\|resume]` |
| **cache-tax** | Tracks the time since the last model request against the prompt-cache TTL. As expiry nears or after it lapses, shows the token count (and optional dollar cost) the next message will pay to re-write the cache. `/keepwarm` sends minimal forked pings while you're idle. It stops at break-even, on a cache miss or when its window ends. | `/keepwarm [30m\|2h\|off\|status]` |
| **reflect** | Detects corrections and preferences ("no, use pnpm", "don't touch the lockfile") and drafts a one-line rule. On approval it appends the rule under `## Rules learned from feedback` in your project or global CLAUDE.md and tells the current session. | `/reflect [add <rule>\|off\|on]` |
| **savvy-progress** | Draws a progress bar above the prompt while Claude works. The bar is determinate when there's a task list and sweeps otherwise. It also shows a live row per sub-agent with model, stage, step, context and output tokens. | `/progress` (panel) |

## Install

From a terminal session, once this branch is on the repository's default branch:

```
/plugin install blast-radius --marketplace anickerson0321-tech/CareerProof
/plugin install cache-tax --marketplace anickerson0321-tech/CareerProof
/plugin install reflect --marketplace anickerson0321-tech/CareerProof
/plugin install savvy-progress --marketplace anickerson0321-tech/CareerProof
```

Answer `y` to add the marketplace, then pick the user scope. Or install from a local clone:

```
claude plugin marketplace add /path/to/CareerProof
claude plugin install blast-radius@careerproof-mods --scope user
```

Options (TTL, price per million tokens, default CLAUDE.md, and more) are in `/plugin configure <name>@careerproof-mods` or `/config`.

## Develop

Each mod has `hooks/` (the module), `types/index.d.ts` (its state contract) and `tests/`:

```
claude plugin validate claude-mods/<mod>
claude plugin test claude-mods/<mod>
```
