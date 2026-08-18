# IMPLEMENTATION-INTELLIGENCE-012K — Precisão de retrieval do KnowledgeEngine

## Problema investigado

A 012H/012J confirmaram, via amostragem real contra o `agent-ai-gateway` em produção, que a
pergunta de garantia rejeitava 4 de 10 respostas da IA (`AI_INVALID_RESPONSE`), mesmo depois do
fix estrutural da 012I/012J (schema de 2 campos `answer_text`/`optional_question`, rejeição
server-side de qualquer resposta com mais de uma pergunta). A hipótese desta tarefa: o
`KnowledgeEngine.searchByQuestion()` podia estar enviando contexto redundante/excessivo para
perguntas simples, o que poderia estar induzindo respostas mais elaboradas (e, portanto, mais
propensas a violar a regra de no-máximo-uma-pergunta).

## Medição real (antes de qualquer mudança)

Reprodução exata do algoritmo de `searchByQuestion` (extração de palavras-chave + stemming +
pontuação + desempate) contra `SEED_KNOWLEDGE_DOCUMENTS`, para as 4 perguntas pedidas:

| Pergunta | Candidatos (pontos, acertosTitulo) | Enviados à IA (top-3) |
|---|---|---|
| "qual é a garantia das peças?" | com-001-garantia(2,3), com-003-nao-coberto-garantia(1,2), com-001-consignacao(1,0) | **3 documentos** |
| "quanto eu vou ganhar de comissão?" | com-001-comissao(2,3), com-001-consignacao(1,0) | **2 documentos** |
| "o acerto tem que ser exatamente em 30 dias?" | com-001-consignacao(2,0), com-001-comissao(1,0), com-004-primeiro-mostruario(1,0) | **3 documentos** |
| "preciso pagar... primeiro mostruário?" | com-004-primeiro-mostruario(3,4), com-001-consignacao(3,0), com-002-processo-candidatura(2,0), +3 outros(1,0) | **3 documentos** |

Em todo caso onde um documento de baixa relevância entrou no resultado, ele bateu por **uma única
palavra-chave genérica**, apenas no corpo/tags/palavrasChave — nunca no título ou id do documento
(`acertosTitulo = 0`). `com-001-consignacao` (peças/prazo aparecem em quase todo o corpus) foi o
poluidor mais comum, aparecendo em 3 das 4 perguntas simples sem nenhuma relação direta com a
pergunta feita.

`com-003-nao-coberto-garantia` **não** é redundante com `com-001-garantia` no corpus local — são
fatos distintos (duração vs. exclusão) armazenados em documentos separados deliberadamente. A
redundância só existe frente ao KI oficial remoto (`garantia-por-tipo-de-peca`, que já funde os
dois fatos), mas isso é um detalhe do PILOT/conteúdo remoto, não do corpus local usado em
LOCAL/SHADOW — por isso **não foi removido**.

## Causa raiz

Não é um problema de ranking incorreto (a ordem já estava certa) nem de limite (`limite=3`) — é a
ausência de um FILTRO de relevância mínima antes do corte por `limite`. Documentos que só batem
por uma palavra genérica no corpo do texto (sem nenhum acerto em título/id) entravam nos 3
primeiros lugares só por não haver concorrência suficiente, poluindo o contexto enviado à IA com
um documento fora do assunto perguntado.

## Opções avaliadas

- **TOP-1 fixo**: rejeitado — quebra as duas perguntas compostas exigidas (`"como funciona a
  comissão e quando faço o acerto?"` e `"qual a garantia e o que não é coberto?"`), que legitimamente
  precisam de 2 documentos.
- **Gap de score fixo (ex.: só manter score ≥ topo − 1)**: rejeitado — matematicamente impossível
  de acertar aqui. O padrão de scores `[2, 1, 1]` da pergunta simples de garantia (onde queremos
  reduzir) é **idêntico** ao padrão `[2, 1]` da pergunta composta de garantia (onde queremos manter
  os 2). Nenhum limiar de gap consegue diferenciar os dois casos usando só `pontos`.
- **Threshold mínimo absoluto de score**: mesmo problema do gap — não há valor de corte que sirva
  para os dois casos acima ao mesmo tempo.
- **Deduplicação semântica de documentos**: avaliada e descartada por escopo — exigiria comparar
  conteúdo entre documentos (heurística nova, mais complexa, maior risco de remover material
  válido) quando o sinal mais simples (título/id) já resolve o caso real observado.
- **Escolhida: filtro de relevância por `acertosTitulo` (sinal já existente)** — ver abaixo.

## Solução implementada

Em [`KnowledgeEngine.searchByQuestion`](../../apps/landing/src/orchestrator/knowledge/KnowledgeEngine.ts),
`acertosTitulo` (usado até aqui só como critério de desempate) passa a atuar também como um FILTRO
de relevância: depois de pontuar e ordenar os candidatos, mantém-se só os documentos que bateram
alguma palavra-chave em título OU id. Se **nenhum** candidato tiver esse sinal (caso real
confirmado na pergunta de "30 dias" — o único documento relevante, `com-001-consignacao`, só bate
no corpo/tags/palavrasChave), o filtro é ignorado e o conjunto original (ordenado por `pontos`)
é mantido — **nunca reduz cobertura abaixo do que já era enviado antes**.

```ts
const comAcertoNoTitulo = candidatos.filter((r) => r.acertosTitulo > 0)
const relevantes = comAcertoNoTitulo.length > 0 ? comAcertoNoTitulo : candidatos
const resultado = relevantes.slice(0, limite).map((r) => r.documento)
```

Por que isto resolve o paradoxo do score-gap: `acertosTitulo` carrega informação que `pontos`
sozinho não tem. Na pergunta composta de garantia, os dois documentos relevantes batem em
título/id (`nao-coberto-garantia`: 4, `com-001-garantia`: 2) — ambos passam no filtro. Na pergunta
simples de garantia, o documento de ruído (`com-001-consignacao`) tem `acertosTitulo = 0` — não
passa. O mesmo padrão de `pontos` produz resultados diferentes porque o sinal usado é outro.

**Por que é geral, não uma regra por tópico**: a regra não menciona "garantia", "comissão" nem
nenhuma palavra específica — usa só `acertosTitulo`, um valor numérico já calculado para TODO
documento e TODA pergunta, independente de assunto. Testado e confirmado válido também para uma
pergunta fora do allowlist PILOT ("qual a idade mínima exigida?" → reduz de resultado
potencialmente ruidoso para só `com-002-elegibilidade`).

## Testes

**Novo:** [`tests/knowledge-retrieval-precision.test.mjs`](../../tests/knowledge-retrieval-precision.test.mjs)
— 22 testes: os 4 casos simples e os 2 compostos exigidos, repetidos para LOCAL/SHADOW/PILOT
(consistência de modo), mais: preservação de `com-003-nao-coberto-garantia`, filtro genérico fora
do allowlist, garantia de nunca-lista-vazia (fallback de segurança), respeito ao parâmetro
`limite` após o filtro.

**Regressão completa (183 testes, 100% verde):** 012K(22) + agent-prompts/012I(16) +
wizard-answer-extraction/012F(29) + wizard-question-interception/012E(32) +
response-composer-questions/012B(19) + knowledge-pilot(22) + knowledge-shadow(25) +
knowledge-source-setting(18).

**Build:** `npm run build:landing` — sucesso (`tsc -b && vite build`, sem erros).
**Lint:** `oxlint` (landing) — sem erros; 2 warnings pré-existentes não relacionados
(`react(only-export-components)` em `button.tsx`/`badge.tsx`, arquivos de UI não tocados).
**`git diff --check`:** sem problemas de whitespace/conflito.

## Amostragem real (≤10 chamadas, só para garantia)

10 chamadas reais ao `agent-ai-gateway` (v12, ACTIVE) em produção, mesma pergunta de garantia,
agora com os 2 documentos pós-fix (`com-001-garantia` + `com-003-nao-coberto-garantia`, sem
`com-001-consignacao`). Log só de metadados seguros (sucesso/falha, código de erro, contagem de
`?`, quantidade de documentos, latência) — nunca conteúdo completo:

| # | HTTP | sucesso | código erro | perguntas na resposta | docs enviados | latência |
|---|---|---|---|---|---|---|
| 0 | 200 | sim | — | 1 | 2 | 2004ms |
| 1 | 200 | sim | — | 1 | 2 | 1890ms |
| 2 | 200 | sim | — | 1 | 2 | 1769ms |
| 3 | 200 | sim | — | 1 | 2 | 1881ms |
| 4 | 200 | sim | — | 1 | 2 | 2176ms |
| 5 | 502 | **não** | AI_INVALID_RESPONSE | — | 2 | 1742ms |
| 6 | 200 | sim | — | 1 | 2 | 2026ms |
| 7 | 200 | sim | — | 1 | 2 | 1907ms |
| 8 | 200 | sim | — | 1 | 2 | 2034ms |
| 9 | 200 | sim | — | 1 | 2 | 1932ms |

**Resultado: 9/10 sucesso, 1/10 fallback (`AI_INVALID_RESPONSE`)** — contra a linha de base de
4/10 confirmada na 012H/012J. Nenhuma resposta com mais de 1 pergunta (mesma garantia estrutural
da 012I/012J, inalterada). Amostra pequena (n=10) — direção clara de melhora, não uma prova
estatística definitiva.

## O que NÃO foi tocado

`checkAtMostOneQuestion`, `ResponsePolicies`, `ResponseComposer`, `agent-prompts.ts` (schema/
prompt da 012I/012J), PILOT allowlist, `PilotKnowledgeRepository`, `ShadowKnowledgeRepository`,
`finalize-candidate`, IPR, Admin, ConsigGold/Knowledge Service remoto, secrets, `settings` no
Supabase (`sofia_knowledge_source` continua `{"modo":"SHADOW"}`). Nenhuma migration. Nenhuma
chamada adicional à Anthropic por turno (ainda 1 chamada por pergunta).

## Arquivos alterados

- `apps/landing/src/orchestrator/knowledge/KnowledgeEngine.ts` (filtro de relevância, ~15 linhas)
- `tests/knowledge-retrieval-precision.test.mjs` (novo, 22 testes)
- `package.json` (+1 script de teste)

## Estado final

Código corrigido localmente, **não commitado, não enviado ao GitHub, sem deploy**. PILOT **não**
foi ativado. `sofia_knowledge_source` = `{"modo":"SHADOW"}` (inalterado, confirmado em produção).
