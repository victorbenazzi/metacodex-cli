# metacodex-cli (`mcx`)

Contrato do v1. Fechado no grill de 2026-08-21. Este arquivo é a fonte. Código que divergir disto está errado, não “evolução informal”.

## O que é

CLI **hub de providers**. Uma sessão, várias carteiras. O app metacodex continua o **shell** (PTY). Esta CLI é o segundo produto: o roteador de sessão que o Pi não entrega.

Job do v1: ser o lugar estável onde a pessoa junta Claude OAuth, Codex OAuth, OpenCode Zen/Go, DeepSeek e Kimi, **sem** o TUI do OpenCode que cai no meio do caminho.

Não é um fork do Pi. Não é um fork do Grok Build. Não é o Agent view que morreu no v0.0.12.

## Decisões travadas (grill)

| # | Tema | Travado |
|---|---|---|
| 1 | Job | Hub de providers. TUI “bom o suficiente”. O que a gente **possui** é o roteador. |
| 2 | Contexto | Pacote X (abaixo). |
| 3 | Motor | Nossa CLI no **SDK do Pi**, sem fork. `createAgentSession` + `InteractiveMode` no dia 1. |
| 4 | Repo | Irmão: `Documents/metacodex-cli`. Git, versão e release próprios. |
| 5 | Home | Completamente separado do app. `~/.mcx`. Só `MCX_HOME`. Não lê `METACODEX_HOME`. |
| 6 | App no v1 | PTY only. Entrada futura no `cli-registry` (`command: "mcx"`). Sem RPC, sem embed. |
| 7 | Fallback | Só transporte. Cadeia explícita. Máx 2 hops. Visível. 401 não hopa. |
| 8 | Handoff | Só o usuário. `/handoff` = seletor tipo `/model` + instrução opcional. Pacote só se a thread tiver conversa. `/model` cross-provider igual, sem prompt de instrução. Thread vazia: só troca o modelo. Sem tool de handoff. |
| 9 | Subagent | Foreground default. Até 3 ao vivo. Sem ninho. Abort em cascata. Sem worktree. Timeout 10 min. |
| 10 | Skills | Agent Skills (`SKILL.md`). Nossas + descoberta read-only de Claude/Codex. Filho: allowlist. |
| 11 | Providers v1 | Catálogo **curado**. Resto do Pi no motor, escondido. |
| 12 | First-run | TUI de verdade, sem portão. `/auth` a qualquer hora. Sem credencial, o turno falha visível. |
| 13 | Nome | Binário `mcx`. Pacote `metacodex-cli`. O app continua `metacodex`. |
| 14 | Status no app | OSC que o app já parseia (0/2, 9, 99). Sem protocolo novo. |

## Pacote X (contexto)

**Fallback.** Mesmo transcript. Troca o endpoint. Strip de blocos provider-specific na hora do reenvio (`cache_control`, thinking/reasoning que o destino não fala). Sem resumo. O usuário não escolheu outro cérebro.

**Handoff.** Transcript + pacote gerado por nós: isto é um handoff, de quem veio, o que estava em curso, o que já valeu, o que não refazer. Tool results entram. Compaction só se a janela do destino for menor. Tools da sessão continuam as mesmas. Instrução do usuário é adendo, nunca substitui o pacote.

**Subagent.** Contexto isolado. Brief (objetivo, constraints, paths). **Não** herda o transcript do pai. Default de tools: `read`, `bash`, `grep`, `find`, `ls`. `write` / `edit` só se o spawn pedir. Resultado: um report. Skills: zero até o spawn passar allowlist.

## Providers visíveis no v1 (`/auth`)

Uma linha = uma carteira. Clique: OAuth no browser **ou** API key. Editar e logout na mesma tela.

| Linha | Provider Pi | Métodos |
|---|---|---|
| Anthropic | `anthropic` | OAuth Claude Pro/Max, API key |
| OpenAI API | `openai` | API key |
| OpenAI Codex | `openai-codex` | OAuth ChatGPT Plus/Pro |
| OpenCode Zen | `opencode` | API key (Zen) |
| OpenCode Go | `opencode-go` | API key (Go) |
| DeepSeek | `deepseek` | API key |
| Kimi | `kimi-coding` | OAuth assinatura, API platform |

IDs confirmados contra o catálogo do Pi na hora de ligar o `/auth`. Se o id de Codex OAuth no SDK for outro, ajusta o mapa, não a linha da UI.

Fora da lista: não aparece em `/auth`, `/model`, `/handoff`, nem na chain de fallback.

## Fallback (política)

Hopa em: 429, 5xx, timeout, overload. Overflow: primeiro compacta (Pi). Se ainda não cabe, hopa só para o próximo da chain com janela maior.

Não hopa em: 401, 403, 400, content policy.

Cadeia: lista explícita em `~/.mcx/settings.json`. Vazia = retry no mesmo modelo (comportamento Pi). Máximo 2 hops. TUI avisa `retrying on deepseek (429 anthropic)`. OSC 0/2 atualiza o título com o modelo atual.

Editada em `/auth` (seção Fallback). Sem wizard no first-run.

## Handoff (TUI)

1. `/handoff`
2. Seletor provider+modelo (igual `/model`, só o catálogo curado autenticado)
3. Instrução opcional. Enter vazio segue.
4. Injeta o pacote (`customType: mcx-handoff`) se a thread tiver conversa. Thread sem turno de usuário/assistente: só troca o modelo. Skill, MCP e system prompt não contam.

`/model` intra-família: troca boba, sem pacote. `/model` de provider diferente: pacote, sem passo de instrução. Thread sem conversa: troca boba, sem pacote.

## Subagent (tool `spawn`)

Quem spawna é o **agente**, não o usuário.

```
spawn({
  description: string,   // curta, TUI do pai
  prompt: string,        // brief. obrigatório
  model?: string,        // "provider/id" do catálogo curado
  background?: boolean,  // default false
  tools?: string[],      // default read-only set; write/edit opt-in
  skills?: string[]      // allowlist. default []
})
```

- Live children: no máximo 3 (fg + bg somados).
- Sem ninho: o filho **não** recebe `spawn`.
- Modelo pinado no spawn; senão, chain do pai.
- Abort do pai mata os filhos. Abort do filho não mata o pai.
- Progresso no pai: tipo da tool + última linha. Não o stream inteiro.
- Timeout 10 min.
- Worktree: não.
- Sessão do filho persiste em `~/.mcx/sessions/subagents/`.

## Skills

Formato: Agent Skills (`SKILL.md`). Serve nos instaladores do Claude, Codex, Pi e no nosso.

**Pai carrega (união):**

- `~/.mcx/skills` (nossas; first-run copia o bundle sem sobrescrever edição do usuário)
- `<repo>/.agents/skills`
- `AGENTS.md` (ancestral, como o Pi)
- read-only: `~/.claude/skills`, `~/.codex/skills`, `<repo>/.claude/skills`, `CLAUDE.md`

**Filho:** só `skills[]` do spawn.

**Bundle v1:** uma skill `mcx` ensinando fallback / handoff / spawn ao modelo. Sem marketplace. `mcx skills add <path|git>` é depois.

Não escrevemos em dirs do Claude/Codex. MCP, hooks e `settings.json` deles: fora.

## Integração com o app (v1)

PTY. O app já trata CLI tabs com heurística + OSC.

Emitir:

- OSC 0/2: título `mcx · provider/model` (hop atualiza)
- OSC 9: turno settled (sua vez)
- OSC 99: 401, chain esgotada, subagent failed

Quando o binário for instalável: uma entrada no `cli-registry` do app. **Não** neste repo. **Não** agora.

RPC, ACP, SDK no webview: não no v1. O Agent view não volta.

## Recs que fechei sem nova pergunta

| Tema | Rec |
|---|---|
| Licença | MIT (o Pi é MIT). |
| Stack | TypeScript, ESM, pnpm, Node `>=22.19.0` (exigência do Pi 0.84). |
| Pin | `@earendil-works/pi-coding-agent@0.84.x` (lockfile pina o patch). |
| Home Pi | `PI_CODING_AGENT_DIR` / `agentDir` = `~/.mcx` (ou `$MCX_HOME`). |
| Projeto | Skills em `.agents/`. Não rebrandar `.pi` no v1. |
| Modelo default | Last-used em settings. Senão, primeiro autenticado na ordem da tabela `/auth`. |
| Idioma TUI | Inglês no v1. pt-BR depois. |
| Tema | Tema `metacodex` no pi-tui quando for barato. Não bloqueia o roteador. |
| Print | `mcx -p` (Pi print mode). |
| Update | `mcx update` re-roda o instalador (GitHub `main`). Não é `pi update`. Não toca `~/.mcx`. |
| RPC | Existe no motor. Não é produto no v1. |
| Windows | Sim. |
| Testes | Vitest no roteador: classify, strip, pacote de handoff, brief, cap de filhos, catálogo. |
| Gateway | Não. |
| Plan mode | Não. |
| MCP | Não. |

## Disco

```
~/.mcx/                 # ou $MCX_HOME
  auth.json             # Pi ModelRuntime
  settings.json         # defaultModel, fallback.chain, fallback.maxHops
  models.json           # só se precisarmos de override
  sessions/
    ...                 # sessão pai (jsonl árvore Pi)
    subagents/          # filhos
  skills/               # bundle + user
  extensions/           # as nossas, carregadas sempre
```

Nada em `~/.pi`. Nada em `~/.metacodex`.

## Arquitetura

```
mcx (binário)
  cli          InteractiveMode do Pi, agentDir nosso
  catalog      filtro do catálogo curado
  auth         comando /auth (OAuth ou key)
  router
    fallback   classify + hops + strip
    handoff    pacote + /handoff
    subagent   spawn + lifecycle
  skills       discovery B
  osc          0/2, 9, 99
```

O loop, tools built-in, compaction, sessions tree, `/model` base: Pi. Fallback, handoff, spawn, `/auth` curado, skills extras, OSC: **nosso**.

## Ordem de construção

1. Home, catálogo, políticas do roteador + testes (este scaffold).
2. Boot da TUI Pi com `agentDir=~/.mcx`.
3. `/auth` curado (OAuth/key, edit, logout).
4. Fallback visível + strip.
5. `/handoff` + pacote; `/model` cross-provider.
6. Tool `spawn` + cap 3 + OSC/progresso.
7. Skills discovery B + bundle `mcx`.
8. OSC 0/2, 9, 99.
9. No app: `cli-registry` quando `mcx` estiver no PATH.

## Fora

- Fork do Pi ou do Grok Build.
- Gateway como produto.
- Embed no Tauri / Agent view.
- Auth compartilhada com o app.
- Marketplace de skills.
- Subagent com transcript do pai.
- Hop silencioso de carteira.
- Binário chamado `metacodex`.
