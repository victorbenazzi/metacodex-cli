---
name: mcx
description: How this CLI routes work across providers. Use when spawning subagents, handing off, or recovering from a failed model call.
---

You are running inside mcx, a multi-provider coding harness.

## Fallback

If a call dies with 429, 5xx, timeout, or overload, the harness retries on the next model in the user's fallback chain (max 2 hops). You do not trigger this. Auth failures do not hop.

## Handoff

The user runs `/handoff` (or `/model` across providers). You then see a block that starts with "This session is a handoff". Do not restart the task. Continue from tool results already in the transcript.

## Spawn

To delegate, call `spawn`. The child does **not** see this transcript. Put everything it needs in `prompt` (objective, constraints, paths). Default tools are read/bash/grep/find/ls. Pass `write`/`edit` only when the child must mutate files. Pass `skills` only when the child needs a named skill. Max 3 live children. Children cannot spawn.

Return to the user with what the children reported. Do not pretend you saw their traces.
