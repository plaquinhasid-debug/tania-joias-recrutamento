# IMPLEMENTATION-INTELLIGENCE-012F — Extração segura de nome e cidade antes de gravar no wizard

## Problema

A revisão final da IMPLEMENTATION-INTELLIGENCE-012E encontrou um bug pré-existente (não criado pela
012E, só confirmado por ela): em `useSofiaFlow.ts`, `provisionalAnswers[step.key] = value` grava o
valor **bruto e literal** digitado pela candidata assim que a resposta é aceita pelo classificador
— nunca existiu uma etapa de extração/normalização do CONTEÚDO da resposta, só a decisão
sim/não de "isto pode preencher o campo?".

Para campos como `nome`/`cidade`, isso é um problema real quando a candidata responde com uma
frase em vez do valor puro:

- `"Moro em Mauá"` → aceito como resposta válida de `cidade` (correto), mas gravado literalmente
  como `"Moro em Mauá"` (errado).
- `"Meu nome é Maria Aparecida da Silva"` → aceito como resposta válida de `nome`, gravado
  literalmente como `"Meu nome é Maria Aparecida da Silva"`.

## Impacto real confirmado

`isCidadeAtendida` (`supabase/functions/finalize-candidate/logic.ts`) compara por **igualdade
exata de string**, depois de uma normalização deliberadamente conservadora (RFC-INTELLIGENCE-007 —
só maiúsculas/acentos/espaços/sufixo UF, nunca remove prefixo conversacional, propositalmente, pra
nunca aproximar cidades diferentes). `"moro em maua"` nunca bate com `"maua"`.

Testado com o código real de produção, antes desta correção:

| Entrada | `isCidadeAtendida` |
|---|---|
| `"Mauá"` | `true` |
| `"Moro em Mauá"` | **`false`** |
| `"Eu moro em Santo André"` | **`false`** |

Pesos reais em produção (`settings.ipr_pesos`): `cidade_atendida: 10`, `thresholds: {aprovar: 80,
analise_min: 60}`. Uma candidata elegível com `trabalha(50)+instagram(10)+whatsapp(10)+cidade(10)=80`
(exatamente no limiar de aprovação automática) que respondesse "Eu moro em Santo André" em vez de
"Santo André" cairia para 70 pontos — de "aprovar" para "médio". Impacto real, não hipotético.

Para `nome`, o impacto é menor (não entra no IPR) mas ainda real: `payload.nome.split(" ")[0]`
(`finalize-candidate/logic.ts:206`, usado para extrair o primeiro nome) extrairia `"Meu"` em vez de
`"Maria"` de `"Meu nome é Maria Aparecida da Silva"`.

## Separação classificação × extração

- **Classificação** (`classifyCandidateMessageContextual.ts`, IMPLEMENTATION-012E): decide só
  "isto pode preencher o objetivo atual?" — nunca transforma o texto. **Não alterada por esta
  tarefa.**
- **Extração** (novo módulo `extractAcceptedAnswerValue.ts`): decide, só DEPOIS que a resposta já
  foi aceita, "qual é o valor limpo que deve ser gravado?" — nunca decide se algo é ou não uma
  resposta válida.

Em [`useSofiaFlow.ts`](../../apps/landing/src/hooks/useSofiaFlow.ts), a extração roda **depois** do
bloco `if (seraInterceptada) { ...; return }` (ou seja, só quando a resposta já foi aceita) e
**antes** de `setAnswers(provisionalAnswers)`:

```ts
if (step.key === "nome" || step.key === "cidade") {
  provisionalAnswers[step.key] = extractAcceptedAnswerValue(step.key, value)
}
```

## Prefixos suportados

**Cidade** (`CITY_PREFIX_PATTERNS`): `"moro em "`, `"eu moro em "`, `"resido em "`, `"eu resido em
"` — ancorados no início da string, case-insensitive.

**Nome** (`NAME_PREFIX_PATTERNS`): `"meu nome é "`, `"meu nome completo é "`, `"me chamo "`, `"eu
me chamo "`.

`"sou <nome>"` foi **deliberadamente deixado de fora** (pedido explícito da tarefa) — "sou" é um
prefixo comum demais em outros contextos (ex.: respostas de `profissao`, "Sou autônoma") para
tratar como prefixo de nome sem uma avaliação mais cuidadosa, fora do escopo desta tarefa.

## Limites deliberados

- **Sem fuzzy matching, sem inferência, sem busca no meio da frase** — só remove um prefixo
  explicitamente reconhecido, ancorado no início. Se nada bater, o valor original volta
  (só com espaços colapsados).
- **Escopo restrito a `nome`/`cidade`** — os únicos dois campos onde já foi confirmado que uma
  frase inteira é aceita mas o valor útil é só uma parte dela. Nenhum outro campo é tocado.
- **Nunca produz campo vazio silenciosamente**: se depois de remover o prefixo sobrar string vazia
  (ex.: `"moro em"` sozinho, sem cidade depois), o prefixo não é usado — o valor original volta.
- **Não mexe em acento, capitalização ou palavras internas** — só remove o prefixo e colapsa
  espaços.
- **`isCidadeAtendida`, `normalizarCidade`, pesos e thresholds do IPR não foram tocados** — a
  correção fica inteiramente na origem (o que é gravado), não no destino.

## Testes

`tests/wizard-answer-extraction.test.mjs` — 29 testes: prefixos de cidade/nome suportados, valores
diretos intactos, campos fora do escopo inalterados, pipeline completo (classificação real +
extração real + `isCidadeAtendida` real do `finalize-candidate/logic.ts`), interação com a 012E
(perguntas/dúvidas continuam nunca sendo armazenadas), regressão explícita de que "Moro em Mauá"
continua sendo *aceito* pela 012E (só o valor gravado mudou).

## Arquivos alterados

- `apps/landing/src/orchestrator/extractAcceptedAnswerValue.ts` (novo)
- `apps/landing/src/hooks/useSofiaFlow.ts` (+10 linhas — só o import e a chamada condicional)
- `package.json` (+2 scripts de teste)
- `tests/wizard-answer-extraction.test.mjs` (novo)

Nenhuma mudança em `classifyCandidateMessageContextual.ts`/`classifyForFeature004.ts` (012E),
`finalize-candidate`, IPR, pesos, thresholds, `isCidadeAtendida`, Admin, ConsigGold, KIs, Knowledge
Service, secrets ou Supabase.

## Estado final

Código corrigido localmente, **não commitado, não enviado ao GitHub, sem deploy**.
`sofia_knowledge_source` = `{"modo":"SHADOW"}` (inalterado). PILOT **não** foi ativado nesta
tarefa.
