# AGENTS.md

This is **metacodex-cli**, binary `mcx`. Sibling of the metacodex desktop app. Not a folder inside that repo.

Read `DESIGN.md` before changing behavior. The grill lock in that file is the spec.

## What this is

A multi-provider coding-agent CLI. Engine: `@earendil-works/pi-coding-agent` SDK (no fork). We own the session router: fallback, handoff, subagents.

The desktop app hosts this as a PTY tab later. Do not embed the agent in the Tauri webview. Do not write to `~/.metacodex`.

## Commands

```bash
pnpm test
pnpm dev
pnpm build
```

Package manager is pnpm. Node `>=22.19.0`.

## Layout

| Path | Role |
|---|---|
| `src/cli.ts` | Entry. Boots Pi InteractiveMode with our `agentDir`. |
| `src/help.ts` | `mcx --help` / `--version` intercept, before Pi. |
| `src/home.ts` | `~/.mcx` / `MCX_HOME`. |
| `src/catalog.ts` | Curated providers visible in `/auth`, `/model`, `/handoff`, fallback. |
| `src/osc.ts` | OSC 0/2, 9, 99 sequences the metacodex app already parses. |
| `src/skills/` | Read-only discovery of Claude/Codex skill dirs. Never writes there. |
| `src/router/` | Fallback, handoff packet, subagent brief, provider-specific strip. This is the product. |
| `skills/mcx/` | Bundled Agent Skill. Copied to `~/.mcx/skills` on first run. Never overwrite user edits. |

## Rules

- No em-dashes in any text (UI, comments, docs, commits).
- Do not resurrect the removed metacodex Agent view.
- Do not add OpenRouter or the rest of the Pi catalog to the v1 pickers.
- Subagents do not inherit the parent transcript.
- Fallback does not hop on 401/403.
- Child sessions cannot call `spawn`.
- Do not `git push` unless Victor asks.
