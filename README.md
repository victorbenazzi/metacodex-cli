# metacodex-cli (`mcx`)

[Português](./README.pt-BR.md)

<p align="center">
  <img src="docs/images/tui.png" alt="mcx TUI with the metacodex mark and prompt" width="920" />
</p>

Coding agent CLI. One session, several wallets. Anthropic, OpenAI, Codex, OpenCode Zen, OpenCode Go, DeepSeek, and Kimi. The product is the session router: visible fallback, user-driven handoff, isolated subagents.

It is not a fork of [Pi](https://github.com/earendil-works/pi-mono). The engine is the Pi SDK. Home is `~/.mcx`. It does not read or write `~/.metacodex` or `~/.pi`.

Status: **0.0.1**. Install from this repo (not on npm yet). The engine is pinned to Pi `0.84.x`. Do not run `pi update`. When the engine moves, a new `mcx` version ships it.

The [metacodex](https://github.com/victorbenazzi) desktop app stays the shell. Later it launches `mcx` as a PTY tab. This repo is the CLI.

## Why

| You get | What that means |
|---|---|
| One harness | Stay in the same TUI instead of bouncing between Claude, Codex, and a second CLI. |
| Curated wallets | `/auth` shows seven providers. The rest of the Pi catalog stays in the engine, hidden. |
| Fallback that you can see | 429, 5xx, timeout, overload hop to the next wallet in your chain. Max 2 hops. The TUI says `retrying on deepseek (rate_limit anthropic)`. |
| Auth does not hop | 401 / 403 / content policy stay on the current model. You fix the key. The CLI does not silently spend another wallet. |
| Handoff you control | `/handoff` picks the next brain, optional instruction, always injects a packet: what was in progress, what is already done, what not to redo. Then the new model starts. |
| Isolated subagents | The agent calls `spawn`. The child does not get the parent transcript. Default tools are read-only. Max 3 live children. Children cannot spawn. |
| Skills you already have | Loads `~/.mcx/skills`, project `.agents/skills`, and unique Claude/Codex skills (read-only). Never writes into `~/.claude` or `~/.codex`. |

## Requirements

- Node.js `>=22.19.0` (the installer checks this)
- A terminal. macOS or Linux. Windows: Git Bash or WSL.
- pnpm is installed for you if Node has corepack or npm

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/victorbenazzi/metacodex-cli/main/scripts/install.sh | bash
```

That downloads this repo, runs `pnpm install && pnpm build`, and links `mcx` to `~/.local/bin/mcx`. Re-run the same command to update.

```bash
mcx --version    # mcx 0.0.1
mcx --help
```

If the shell says `command not found`, add `~/.local/bin` to `PATH` and open a new terminal:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Uninstall (keeps `~/.mcx`: auth, sessions, settings):

```bash
curl -fsSL https://raw.githubusercontent.com/victorbenazzi/metacodex-cli/main/scripts/install.sh | bash -s -- --uninstall
```

Pin a ref with `MCX_REF` (branch, tag, or commit):

```bash
curl -fsSL https://raw.githubusercontent.com/victorbenazzi/metacodex-cli/main/scripts/install.sh | MCX_REF=main bash
```

### Install from a clone

```bash
git clone https://github.com/victorbenazzi/metacodex-cli.git
cd metacodex-cli
pnpm install
pnpm build
mkdir -p ~/.local/bin
ln -sfn "$(pwd)/dist/cli.js" ~/.local/bin/mcx
```

Override the home directory with `MCX_HOME`. Default is `~/.mcx`.

## First run

```bash
cd your-project
mcx
```

There is no login gate. The TUI opens. Connect a wallet when you need one.

1. `/auth` and pick a provider.
2. OAuth opens the browser (Codex may ask browser vs device code). API key is pasted in the TUI.
3. Optional: `/auth fallback` and order the hop list (example: anthropic, deepseek, kimi).
4. Talk to the agent like any coding CLI.

If nothing is connected, the status line says `/auth to connect a provider`. A turn without credentials fails in the open.

### Anthropic OAuth

Claude Pro/Max OAuth in `mcx` uses Anthropic **extra usage**, billed per token. It does not draw from the Claude plan the way Claude Code does. If extra usage is empty you get HTTP 400. Use an Anthropic **API key** in `/auth`, or top up extra usage at [claude.ai/settings/usage](https://claude.ai/settings/usage).

### Resume a session

On quit the CLI prints:

```text
To resume this session: mcx --session <id>
```

Sessions live under `~/.mcx/sessions`. Use `mcx --session`, not `pi --session`.

Print mode (one shot, no TUI):

```bash
mcx -p "What does this repo do? Read README.md."
```

## Providers (`/auth`)

| Line | Auth |
|---|---|
| Anthropic | OAuth (Claude Pro/Max) or API key |
| OpenAI API | API key |
| OpenAI Codex | OAuth (ChatGPT Plus/Pro) |
| OpenCode Zen | API key |
| OpenCode Go | API key |
| DeepSeek | API key |
| Kimi | OAuth or API key |

Same screen: connect, change method, log out, edit the fallback chain.

## In session

| Command | What |
|---|---|
| `/auth` | Connect a curated provider, or edit the fallback chain. |
| `/handoff` | Pick another connected model, optional instruction. Always injects a handoff packet, then starts a turn. |
| `/model` | Switch model. Same family: just switch. Other provider: packet, no instruction prompt, no auto-turn. |

`spawn` is a tool the parent agent calls. It is not a slash command.

### Fallback

Configured in `/auth fallback`, stored as `fallback.chain` in `~/.mcx/settings.json`. Empty chain: retry on the same model.

Hops on: 429, 5xx, timeout, overload. Overflow: compact first; hop only to a larger window.

Does not hop on: 401, 403, 400, content policy.

Max 2 hops. Notice looks like `retrying on deepseek (rate_limit anthropic)`.

### Handoff packet

The next model sees who it replaced, what was in progress, tool work already done, and what not to redo. Your instruction is an add-on. It never replaces the packet. Tool results in the transcript stay ground truth.

### Subagents (`spawn`)

```
spawn({
  description: string,   // short label in the parent TUI
  prompt: string,        // brief. required. the child does not see the parent chat
  model?: string,        // "provider/id"
  background?: boolean,  // default false
  tools?: string[],      // default read, bash, grep, find, ls. write/edit opt-in
  skills?: string[]      // allowlist. default none
})
```

- Max 3 live children (foreground + background).
- No nesting. The child does not get `spawn`.
- Parent abort kills children. Child abort does not kill the parent.
- Timeout 10 minutes. No worktree. Sessions under `~/.mcx/sessions/subagents/`.

### Skills

Parent loads the union of:

- `~/.mcx/skills` (the bundled `mcx` skill is copied on first run; user edits are never overwritten)
- `<repo>/.agents/skills`
- `AGENTS.md` / `CLAUDE.md` (as Pi already does)
- Unique names from `~/.claude/skills`, `~/.codex/skills`, `<repo>/.claude/skills` (read-only)

A child only gets skills named in `spawn.skills`.

## Config on disk

```text
~/.mcx/                 # or $MCX_HOME
  auth.json
  settings.json         # theme, fallback.chain, enabledModels
  sessions/
    subagents/
  skills/
  themes/               # metacodex-dark / metacodex-light
```

`enabledModels` is kept in sync with wallets that actually have a credential, so the TUI does not warn about empty `openai/*` patterns.

## Development

```bash
pnpm install
pnpm test
pnpm dev          # tsx, same home ~/.mcx
pnpm build
```

The v1 contract is [DESIGN.md](./DESIGN.md) (Portuguese). Code that disagrees with it is wrong.

## License

[MIT](./LICENSE)
