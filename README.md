# metacodex-cli (`mcx`)

Coding agent CLI. One session, several wallets. Anthropic, Codex, OpenCode Zen/Go, DeepSeek, Kimi. The thing we own is the session router: fallback, handoff, cross-provider subagents.

The metacodex desktop app stays the shell. This CLI runs in a PTY tab (and in any terminal). It is not a fork of Pi. It uses the Pi SDK as the engine.

Status: v1 is being built. Contract is in [DESIGN.md](./DESIGN.md).

## Requirements

- Node `>=22.19.0`
- pnpm

## Dev

```bash
pnpm install
pnpm test
pnpm dev          # interactive TUI (Pi InteractiveMode, home ~/.mcx)
```

Home is `~/.mcx` (override with `MCX_HOME`). It does not read or write `~/.metacodex`.

## Commands (v1)

| Command | What |
|---|---|
| `/auth` | Curated providers. OAuth or API key. Edit and logout. Fallback chain. |
| `/handoff` | Pick provider+model, optional instruction. Always injects a handoff packet. |
| `/model` | Pi model picker, curated. Cross-provider also injects the packet. |

The parent agent spawns children with the `spawn` tool. That is not a slash command.

Parent skills are the union of `~/.mcx/skills`, `.agents/skills`, AGENTS.md, plus read-only `~/.claude/skills`, `~/.codex/skills`, and `<repo>/.claude/skills`. A child only gets skills named in the spawn allowlist.

## License

MIT
