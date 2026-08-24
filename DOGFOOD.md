# Dogfood: construir a LP da Lote no `mcx`

Uma sessão. Várias carteiras. O trabalho é uma landing page. Cada etapa testa uma peça do roteador.

**Não rode o `mcx` dentro de `metacodex-cli`.** O `AGENTS.md` da CLI vaza para o modelo.

```bash
cd ~/Documents/mcx-dogfood
open index.html
mcx
```

A pasta já tem um `index.html` esqueleto: tokens, marca **Lote**, zero dobras. Assinatura semanal de café, 250g, torrado em Porto Alegre, sai terça, chega quinta, R$ 64, frete incluso na cidade.

Cola **um prompt por vez**. Recarrega o browser depois de cada etapa que mexe no HTML. Se quebrar, anota o que a TUI mostrou. Não pule para handoff com a página ainda vazia: o pacote precisa de tool results no transcript.

Marca o item quando passar.

---

## Antes. Terminal, sem TUI

```bash
which mcx
mcx --version
mcx --help
mcx update
```

Esperado: `~/.local/bin/mcx`, `mcx 0.0.1`, help nosso, e o `update` recusado (`pins the Pi engine`). Sem InteractiveMode.

Carteiras. Não precisa das sete. Precisa de **duas** para handoff e fallback:

- Anthropic (OAuth ou key) como cérebro principal
- Um segundo: Codex OAuth, DeepSeek, Kimi ou OpenCode
- Ideal: três, para a chain hopar duas vezes

---

## Etapa 0. Boot e carteiras

```bash
cd ~/Documents/mcx-dogfood
mcx
```

Olho no boot:

- Header: marca de duas vírgulas, `metacodex-cli 0.0.1`, `one session, several wallets`
- Tema cream/ink, laranja no nome e na seleção. Não o teal do Pi
- Sem `[Skills]`, sem `[Skill conflicts]`, sem caixa `Update Available` / `pi update`
- Sem portão. TUI abre mesmo sem credencial
- Status `/auth to connect a provider` se nada estiver conectado
- `/` lista `/auth` e `/handoff`. Anota se o `/login` nativo do Pi ainda mostra OpenRouter, Gemini, o resto. Isso fura o grill

Se um boot antigo deixou `theme: "dark"`, vai em `/settings` e escolhe `metacodex-light/metacodex-dark`.
Se o dump de skills voltar, `quietStartup` tem que ser `true` em `~/.mcx/settings.json`. O first-run grava. Não sobrescreve `false`.

### Auth

`/auth`

- Só 7 linhas: Anthropic, OpenAI API, OpenAI Codex, OpenCode Zen, OpenCode Go, DeepSeek, Kimi
- Conecta a primeira. OAuth no browser ou key
- O hint de `/auth` some
- Logout e reconecta uma vez
- Conecta a segunda carteira

Disco: `~/.mcx/auth.json`. Nada em `~/.metacodex` nem `~/.pi` por causa do `mcx`.

### Fallback

`/auth fallback` (ou a linha `fallback` no `/auth`)

Ordem de exemplo: anthropic, deepseek, kimi. Done.

A TUI avisa `Fallback chain: anthropic, deepseek, kimi`. Em `~/.mcx/settings.json` os ids são os do Pi (`kimi-coding`, não `kimi`). Chain vazia = retry no mesmo modelo.

---

## Etapa 1. Hero. Tools do pai

Testa: `read` / `write` / `edit` no HTML. Sem spawn.

```
Lê index.html. Esta é a LP da Lote.

Produto: assinatura semanal de café, 250g, origem única, torrado em Porto Alegre. Sai do tambor na terça. Chega na quinta. R$ 64 por semana. Frete incluso em Porto Alegre.

Adiciona só o hero, abaixo da marca, ainda dentro de .wrap:
- title da página
- h1 concreto (terça / quinta, sem slogan de lifestyle, sem a palavra paixão)
- lede com peso, origem única, cidade
- um CTA "Começar assinatura. R$ 64 / semana" com href="#assinar"

Não inventa framework. Não cria outras seções. Um HTML. Edita o arquivo.
```

Olho: tools na TUI. Browser: marca + hero + botão. O botão ainda não tem âncora destino. Tudo bem.

---

## Etapa 2. Prova. Três cards

Testa: o pai continua o transcript. `edit` no mesmo arquivo.

```
Ainda no index.html, depois do hero, adiciona a seção "O que vem no saco" com exatamente três cards:

1. Um único origem. Não é blend. Nome do produtor na etiqueta.
2. Torrado na semana. Tambor na terça, envio na quarta, porta na quinta.
3. Pausa uma semana sem taxa.

Usa as classes que já existem (.grid.two, article). Não redesenha o hero.
```

Olho: três cards no browser. Hero intacto.

---

## Etapa 3. Preço. Âncora do CTA

Testa: o pai fecha o funil básico antes de spawnar.

```
Adiciona a seção de preço com id="assinar".

R$ 64. 250g por semana. Frete incluso em Porto Alegre. Interior a calcular.
Diz em duas frases o que acontece se a pessoa pausar, e o que não está incluso.

Repete o mesmo CTA no fim desta seção (mesmo href, mesmo texto).
Não vira checkout. Não cria FAQ.
```

Olho: clicar o CTA do topo salta para o preço. Dois botões iguais.

---

## Etapa 4. FAQ. Spawn em foreground

Testa: tool `spawn`. Filho **não** herda o transcript. Brief tem que carregar objetivo, constraints, path.

```
A FAQ ainda não existe. Spawna um subagent em foreground para escrever a seção "Perguntas" no index.html.

O filho não vê este chat. No prompt dele, coloca tudo:
- objetivo: 5 pares pergunta/resposta em português, dentro de uma <section> com h2 Perguntas e uma dl.faq
- path: index.html
- constraints: mesmo HTML, sem CSS novo, tom direto, sem clichê de cafeteria, sem a palavra paixão, não mexe no hero nem no preço
- tools: read, write, edit
- não pode spawnar

Quando o filho voltar, me resume o report. Não reescreve a FAQ se ele já escreveu.
```

Olho:

- O pai chama `spawn`. Não é slash command
- Brief isolado (objetivo, constraints, path)
- Progresso no pai: nome da tool + última linha, não o stream inteiro
- No fim, um report. FAQ no HTML
- `~/.mcx/sessions/subagents/` ganhou arquivo

---

## Etapa 5. Footer. Spawn em background

Testa: `background: true`. O pai continua livre.

```
Spawna em background um subagent só para o footer.

Prompt do filho: adicionar no footer, sem apagar "Lote", o email contato@lote.cafe, um texto curto de pausa, e a cidade. Path index.html. tools read e edit. Sem spawn. Sem mexer nas seções de cima.

Enquanto ele corre, não fique esperando. Quando o report chegar, me mostra.
```

Olho: `Spawned in background: ...` na hora. Depois, follow-up `Subagent finished (...)`. Footer no browser. Se falhar: `Subagent failed` (OSC 99 no app).

Neste meio tempo você pode mandar um turno curto, para confirmar que o pai não travou:

```
Quantas seções o index.html tem agora? Só conta. Não edita.
```

---

## Etapa 6. Cap de 3. Auditoria paralela

Testa: máximo 3 filhos ao vivo. O quarto recusa.

```
Spawna 4 subagents ao mesmo tempo, todos em background, só leitura, sem write/edit/spawn. Cada um devolve uma linha:
1. hero: o h1 está concreto?
2. cards: os três prometem coisa distinta?
3. preço: dá para pausar sem caçar letra miúda?
4. footer: tem email?

O quarto tem que ser recusado. Não inventa um quinto.
```

Olho: `Already 3 live subagents` no quarto. Os três correm. Esc no pai mata os filhos. Abort de um filho não mata o pai.

---

## Etapa 7. `/model` intra-família. Micro polish

Testa: troca de modelo **no mesmo** provider. Sem pacote de handoff.

`/model` e escolhe outro modelo da mesma carteira.

Olho: **não** aparece `This session is a handoff`.

```
O h1 ainda pode ser mais falado. Reescreve só o h1 e o lede, com o que a página já promete. Sem nova seção. Sem a palavra paixão.
```

Olho: só hero muda. Cards, preço, FAQ, footer iguais.

---

## Etapa 8. `/model` cross-provider. Pacote automático

Testa: provider diferente. Pacote entra **sem** passo de instrução.

`/model` para um modelo da segunda carteira.

Olho: bloco começando com `This session is a handoff`. Notify `Handed off to provider/id`. Título do terminal vira `mcx · provider/model`.

```
Você acabou de receber um handoff. Não recomeça a LP. Não apaga seções.

Só deixa o bloco de preço honesto em no máximo 6 linhas: valor, peso, o que o frete cobre, o que não cobre, como pausar, como cancelar. Copy de gente, não de termos de uso.
```

Olho: o destino continua. Preço mais claro. Resto intacto.

---

## Etapa 9. `/handoff` com instrução

Testa: seletor + instrução opcional. Pacote **sempre**. Instrução é adendo.

`/handoff`

1. Escolhe o outro cérebro (pode voltar para o principal)
2. Cola isto no passo de instrução:

```
Não redesenha. Não mexe no hero. Só revisa a FAQ: corta pergunta fofa, deixa as 5 úteis (pausa, grão vs moído, interior, presente, cancelar). Mesmo HTML.
```

3. Enter

Olho: seletor só do catálogo curado autenticado. Pacote entra. A linha `User instruction for this handoff` existe. FAQ muda. Hero não.

---

## Etapa 10. `/handoff` vazio

Testa: Enter vazio também injeta pacote.

`/handoff` de novo, outro modelo, instrução vazia.

Olho: pacote mesmo assim. `Already done` cita tools/paths. `Do not redo` não manda reescrever `index.html` do zero.

```
Olha o pacote de handoff. Lista o que você não vai refazer. Não edita nada.
```

Olho: ele fala do que já foi feito. HTML igual no browser.

---

## Etapa 11. 401 não hopa

Obrigatório. Não depende de 429.

Com a chain montada, `/auth`, **Logout** do provider ativo.

```
Qual é o h1 da página agora?
```

Olho:

- **Não** hopa
- Notify `auth failed`
- Status `auth failed`
- No app: OSC 99, não OSC 9 de "sua vez"

Reconecta no `/auth` antes de seguir.

429, 5xx, timeout, overload: se aparecer no meio do trabalho, a TUI avisa `retrying on deepseek (rate_limit anthropic)` (os nomes mudam com a chain). Título atualiza. Máximo 2 hops. Depois: `fallback chain exhausted`. 400 de policy não hopa. Overflow compacta primeiro. Se não aparecer 429 hoje, não bloqueia o dogfood.

---

## Etapa 12. Print mode

Sai da TUI.

```bash
cd ~/Documents/mcx-dogfood
mcx -p "Em uma frase, o que a Lote vende? Lê index.html. Não edita."
```

Olho: uma resposta e o processo acaba. Sem TUI. Sem header ASCII.

---

## Etapa 13. OSC no app (se o tab PTY existir)

No metacodex desktop:

- Título do tab: `mcx · provider/model`. Hop e `/model` atualizam
- Fim de turno: OSC 9
- 401, chain esgotada, subagent failed: OSC 99

Fora do app, o título do terminal ainda muda. 9 e 99 só importam no host que parseia.

---

## Prompts extras. Só se a LP já estiver de pé

Cola um por vez. Não misture com spawn.

**Contraste e tipo**

```
No CSS do index.html, o lede e o footer estão no mesmo --muted. Deixa o footer um pouco mais apagado, sem mudar a cor do h1. Sem biblioteca.
```

**CTA secundário**

```
Depois da FAQ, antes do footer, um parágrafo de uma linha e o mesmo CTA de novo. Não cria formulário.
```

**Spawn read-only**

```
Spawna um filho só com read (sem write, edit, spawn) para caçar href="#", TODO, copy genérica e contraste ruim. Report com file:line. Sem rewrite.
```

---

## Passou quando

| Etapa | Passou quando |
|---|---|
| Antes | `mcx --help` nosso, `mcx update` recusado |
| 0 Boot | Header e tema nossos. Sem dump. Sem amarelo de Pi |
| 0 Auth | 7 carteiras, logout, `~/.mcx/auth.json` |
| 0 Fallback | Chain no `settings.json` com ids do Pi |
| 1 Hero | HTML no disco e no browser |
| 2 Cards | Três cards, hero intacto |
| 3 Preço | CTA do topo ancora em `#assinar` |
| 4 Spawn fg | Brief isolado, FAQ no HTML, sessão em `subagents/` |
| 5 Spawn bg | Pai livre, footer depois |
| 6 Cap 3 | Quarto recusado |
| 7 `/model` intra | Sem pacote |
| 8 `/model` cross | Pacote, preço continua, página não recomeça |
| 9 `/handoff` | Pacote + instrução, FAQ muda, hero não |
| 10 Handoff vazio | Pacote mesmo assim, HTML igual |
| 11 401 | Não hopa, `auth failed` |
| 12 `-p` | Uma shot e sai |
| 13 OSC | Só se testar no app |

---

## Disco

```
~/Documents/mcx-dogfood/index.html
~/.mcx/settings.json       theme, quietStartup, enabledModels, fallback.chain
~/.mcx/auth.json
~/.mcx/themes/
~/.mcx/skills/mcx/SKILL.md
~/.mcx/sessions/subagents/
```

Nada disso em `~/.pi` nem `~/.metacodex`.
