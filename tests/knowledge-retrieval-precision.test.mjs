import test from "node:test"
import assert from "node:assert/strict"
import { createDefaultKnowledgeEngine } from "../apps/landing/src/orchestrator/knowledge/KnowledgeEngine.ts"

const ids = (docs) => docs.map((d) => d.id)

// -----------------------------------------------------------------------
// IMPLEMENTATION-012K — precisão de retrieval do KnowledgeEngine.
//
// Hipótese investigada: perguntas simples recebiam contexto redundante
// (2-3 documentos, incluindo documentos pouco relevantes) — o que pode ter
// contribuído para o fallback intermitente (AI_INVALID_RESPONSE) observado
// em amostragem real na 012H/012J para "garantia" (4/10).
//
// Medição real (searchByQuestion, sem nenhuma mudança de código) confirmou:
// - "qual é a garantia das peças?" -> 3 documentos, incluindo
//   com-001-consignacao (pontos=1, acertosTitulo=0 — bate só por uma
//   palavra genérica no corpo, nunca no título/id).
// - "quanto eu vou ganhar de comissão?" -> 2 documentos, mesmo padrão.
// - "preciso pagar... primeiro mostruário?" -> 3 documentos, 2 deles
//   (com-001-consignacao, com-002-processo-candidatura) com acertosTitulo=0.
// - "o acerto tem que ser exatamente em 30 dias?" -> 3 documentos, NENHUM
//   com acertosTitulo>0 (o único documento realmente relevante,
//   com-001-consignacao, bate só no corpo/tags/palavrasChave, nunca no
//   título "Como funciona a consignação" nem no id).
//
// Fix aplicado: `acertosTitulo` (sinal já existente, usado antes só como
// desempate) passa a ser também um FILTRO de relevância — mantém só
// documentos que bateram alguma palavra-chave em título/id; se NENHUM
// candidato bater (caso confirmado de "30 dias"), mantém o conjunto
// original inteiro (nunca reduz cobertura abaixo do que já era enviado).
// Regra geral, aplicada a qualquer pergunta — não é lógica por tópico.
// -----------------------------------------------------------------------

for (const mode of ["LOCAL", "SHADOW", "PILOT"]) {
  test(`[${mode}] garantia: contexto reduzido de 3 para 2 documentos (remove com-001-consignacao, irrelevante)`, async () => {
    const engine = createDefaultKnowledgeEngine(mode)
    const docs = await engine.searchByQuestion("qual é a garantia das peças?", 3)
    assert.deepEqual(ids(docs), ["com-001-garantia", "com-003-nao-coberto-garantia"])
  })

  test(`[${mode}] comissão: contexto reduzido de 2 para 1 documento (remove com-001-consignacao, irrelevante)`, async () => {
    const engine = createDefaultKnowledgeEngine(mode)
    const docs = await engine.searchByQuestion("quanto eu vou ganhar de comissão?", 3)
    assert.deepEqual(ids(docs), ["com-001-comissao"])
  })

  test(`[${mode}] primeiro mostruário: contexto reduzido de 3 para 1 documento (o próprio documento já é autossuficiente)`, async () => {
    const engine = createDefaultKnowledgeEngine(mode)
    const docs = await engine.searchByQuestion("preciso pagar alguma coisa para receber o primeiro mostruário?", 3)
    assert.deepEqual(ids(docs), ["com-004-primeiro-mostruario"])
  })

  test(`[${mode}] 30 dias: SEM redução — nenhum candidato bate em título/id, fallback preserva os 3 documentos originais (nunca perde cobertura)`, async () => {
    const engine = createDefaultKnowledgeEngine(mode)
    const docs = await engine.searchByQuestion("o acerto tem que ser exatamente em 30 dias?", 3)
    assert.deepEqual(ids(docs), ["com-001-consignacao", "com-001-comissao", "com-004-primeiro-mostruario"])
  })

  test(`[${mode}] composta — comissão + acerto: continua trazendo os 2 documentos necessários (nenhuma redução indevida)`, async () => {
    const engine = createDefaultKnowledgeEngine(mode)
    const docs = await engine.searchByQuestion("como funciona a comissão e quando faço o acerto?", 3)
    assert.ok(ids(docs).includes("com-001-comissao"), "deve incluir o documento de comissão")
    assert.ok(ids(docs).includes("com-001-consignacao"), "deve incluir o documento do acerto/ciclo")
  })

  test(`[${mode}] composta — garantia + o que não é coberto: continua trazendo os 2 documentos necessários (nenhuma redução indevida)`, async () => {
    const engine = createDefaultKnowledgeEngine(mode)
    const docs = await engine.searchByQuestion("qual a garantia e o que não é coberto?", 3)
    assert.ok(ids(docs).includes("com-001-garantia"), "deve incluir a duração da garantia")
    assert.ok(ids(docs).includes("com-003-nao-coberto-garantia"), "deve incluir a exclusão da garantia")
  })
}

// -----------------------------------------------------------------------
// Nenhum material perdido: com-003-nao-coberto-garantia continua existindo
// e continua sendo retornado junto com com-001-garantia na pergunta simples
// de garantia (a redundância suspeitada era com-001-consignacao, não este
// documento — a exclusão de garantia é fato distinto da duração, ambos
// continuam sendo enviados à IA).
// -----------------------------------------------------------------------

test("com-003-nao-coberto-garantia não foi removido do resultado da pergunta simples de garantia", async () => {
  const engine = createDefaultKnowledgeEngine("LOCAL")
  const docs = await engine.searchByQuestion("qual é a garantia das peças?", 3)
  assert.ok(ids(docs).includes("com-003-nao-coberto-garantia"))
})

// -----------------------------------------------------------------------
// Comportamento genérico do filtro (não é regra hardcoded por tópico) —
// verificado com perguntas fora dos 4 tópicos do allowlist PILOT.
// -----------------------------------------------------------------------

test("filtro genérico também se aplica a pergunta fora do allowlist PILOT (idade mínima)", async () => {
  const engine = createDefaultKnowledgeEngine("LOCAL")
  const docs = await engine.searchByQuestion("qual a idade minima exigida?", 3)
  assert.deepEqual(ids(docs), ["com-002-elegibilidade"])
})

test("nunca retorna lista vazia quando havia candidatos antes do filtro (fallback de segurança)", async () => {
  const engine = createDefaultKnowledgeEngine("LOCAL")
  const docs = await engine.searchByQuestion("o acerto tem que ser exatamente em 30 dias?", 3)
  assert.ok(docs.length > 0)
})

test("limite continua sendo respeitado após o filtro de relevância", async () => {
  const engine = createDefaultKnowledgeEngine("LOCAL")
  const docs = await engine.searchByQuestion("qual é a garantia das peças?", 1)
  assert.equal(docs.length, 1)
  assert.deepEqual(ids(docs), ["com-001-garantia"])
})
