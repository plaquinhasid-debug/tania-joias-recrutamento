import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { classifyCandidateMessageContextual } from "../apps/landing/src/orchestrator/classifyCandidateMessageContextual.ts"
import { classifyMessageForFeature004, looksCompatibleWithCurrentField, conservativeErrorFallback } from "../apps/landing/src/orchestrator/classifyForFeature004.ts"
import { runContextualExamples } from "../apps/landing/src/orchestrator/classifyCandidateMessageContextual.examples.ts"
import { runClassifyForFeature004Examples } from "../apps/landing/src/orchestrator/classifyForFeature004.examples.ts"

function classify(message, fieldKey) {
  return classifyCandidateMessageContextual({ message, currentFieldKey: fieldKey, currentQuestion: "" })
}

function classify004(message, fieldKey) {
  return classifyMessageForFeature004({ message, currentFieldKey: fieldKey, currentQuestion: "", fieldKind: "TEXT", expectedValueType: "STRING" })
}

// -----------------------------------------------------------------------
// A) currentGoal = nome
// -----------------------------------------------------------------------

test("A1. nome: 'Maria Aparecida da Silva' consome nome", () => {
  const r = classify("Maria Aparecida da Silva", "nome")
  assert.equal(r.kind, "ANSWER")
  assert.equal(r.canFillCurrentField, true)
})

test("A2. nome: 'João Carlos' consome nome", () => {
  const r = classify("João Carlos", "nome")
  assert.equal(r.kind, "ANSWER")
  assert.equal(r.canFillCurrentField, true)
})

test("A3. nome: 'quanto eu ganho de comissão' (sem ?) NÃO consome nome", () => {
  const r = classify("quanto eu ganho de comissão", "nome")
  assert.equal(r.canFillCurrentField, false)
})

test("A4. nome: 'quanto eu ganho de comissão?' (com ?) NÃO consome nome", () => {
  const r = classify("quanto eu ganho de comissão?", "nome")
  assert.equal(r.canFillCurrentField, false)
})

test("A5. nome: 'o acerto tem que ser exatamente em 30 dias' (sem ?) NÃO consome nome — reprodução real do incidente 012D", () => {
  const r = classify("o acerto tem que ser exatamente em 30 dias", "nome")
  assert.equal(r.canFillCurrentField, false, `classificado como ${r.kind}, deveria não preencher`)
})

test("A5b. nome: exata frase digitada por Tania no incidente — 'o certo tem que ser exatamente em 30 dias' NÃO consome nome", () => {
  const r = classify("o certo tem que ser exatamente em 30 dias", "nome")
  assert.equal(r.canFillCurrentField, false, `classificado como ${r.kind}, deveria não preencher`)
})

test("A6. nome: 'o acerto tem que ser exatamente em 30 dias?' (com ?) NÃO consome nome", () => {
  const r = classify("o acerto tem que ser exatamente em 30 dias?", "nome")
  assert.equal(r.canFillCurrentField, false)
})

test("A7. nome: 'tenho dúvida sobre a garantia' NÃO consome nome", () => {
  const r = classify("tenho dúvida sobre a garantia", "nome")
  assert.equal(r.canFillCurrentField, false)
  assert.equal(r.kind, "DOUBT")
})

test("A8. nome: 'não entendi como funciona o primeiro mostruário' NÃO consome nome", () => {
  const r = classify("não entendi como funciona o primeiro mostruário", "nome")
  assert.equal(r.canFillCurrentField, false)
  assert.equal(r.kind, "DOUBT")
})

// -----------------------------------------------------------------------
// B) currentGoal = cidade
// -----------------------------------------------------------------------

test("B1. cidade: 'Santo André' consome cidade", () => {
  const r = classify("Santo André", "cidade")
  assert.equal(r.kind, "ANSWER")
  assert.equal(r.canFillCurrentField, true)
})

test("B2. cidade: 'Mauá' consome cidade", () => {
  const r = classify("Mauá", "cidade")
  assert.equal(r.kind, "ANSWER")
  assert.equal(r.canFillCurrentField, true)
})

test("B3. cidade: 'São Caetano do Sul' consome cidade (marcador 'sao' deliberadamente excluído de CLAUSE_MARKERS)", () => {
  const r = classify("São Caetano do Sul", "cidade")
  assert.equal(r.kind, "ANSWER")
  assert.equal(r.canFillCurrentField, true)
})

test("B3b. cidade: 'Moro em Mauá' continua consumindo cidade (regressão da Parte 2, exemplo 8)", () => {
  const r = classify("Moro em Mauá", "cidade")
  assert.equal(r.kind, "ANSWER")
  assert.equal(r.canFillCurrentField, true)
})

test("B4. cidade: 'quanto é a comissão' NÃO consome cidade", () => {
  const r = classify("quanto é a comissão", "cidade")
  assert.equal(r.canFillCurrentField, false)
})

test("B5. cidade: 'precisa pagar o primeiro mostruário' NÃO consome cidade", () => {
  const r = classify("precisa pagar o primeiro mostruário", "cidade")
  assert.equal(r.canFillCurrentField, false, `classificado como ${r.kind}, deveria não preencher`)
})

// -----------------------------------------------------------------------
// C) outros objetivos — respostas normais continuam sendo consumidas
// -----------------------------------------------------------------------

test("C1. profissao: 'Trabalho como professora' consome profissao", () => {
  const r = classify("Trabalho como professora", "profissao")
  assert.equal(r.kind, "ANSWER")
  assert.equal(r.canFillCurrentField, true)
})

test("C2. profissao: 'Sou vendedora autônoma' consome profissao", () => {
  const r = classify("Sou vendedora autônoma", "profissao")
  assert.equal(r.canFillCurrentField, true)
})

test("C3. empresa_atual: 'Sou autônoma' consome empresa_atual", () => {
  const r = classify("Sou autônoma", "empresa_atual")
  assert.equal(r.kind, "ANSWER")
  assert.equal(r.canFillCurrentField, true)
})

test("C4. experiencia_vendas: 'Nunca vendi' consome experiencia_vendas", () => {
  const r = classify("Nunca vendi", "experiencia_vendas")
  assert.equal(r.kind, "ANSWER")
  assert.equal(r.canFillCurrentField, true)
})

test("C5. objetivo: 'Quero renda extra' consome objetivo (contém 'quero', um CLAUSE_MARKER — mas objetivo não usa looksLikeFullSentence)", () => {
  const r = classify("Quero renda extra", "objetivo")
  assert.equal(r.kind, "ANSWER")
  assert.equal(r.canFillCurrentField, true)
})

test("C6. tempo_disponivel: 'Tenho pouco tempo' consome tempo_disponivel", () => {
  const r = classify("Tenho pouco tempo", "tempo_disponivel")
  assert.equal(r.kind, "ANSWER")
  assert.equal(r.canFillCurrentField, true)
})

test("C7. whatsapp: 'sim' consome whatsapp", () => {
  const r = classify("sim", "whatsapp")
  assert.equal(r.canFillCurrentField, true)
})

test("C8. trabalha: 'sim' consome trabalha", () => {
  const r = classify("sim", "trabalha")
  assert.equal(r.canFillCurrentField, true)
})

test("C9. instagram: '@maria.revende' consome instagram", () => {
  const r = classify("@maria.revende", "instagram")
  assert.equal(r.canFillCurrentField, true)
})

test("C10. cidade: 'quanto é a comissão' em cidade continua OBJECTION/OUTRO para 'tenho pouco tempo' (regressão da Parte 2, exemplo 2 — OBJECTION, não QUESTION)", () => {
  const r = classify("Tenho pouco tempo", "cidade")
  assert.equal(r.kind, "OBJECTION")
  assert.equal(r.canFillCurrentField, false)
})

// -----------------------------------------------------------------------
// D) retomada — currentGoal preservado, no máximo uma chamada
// -----------------------------------------------------------------------

test("D1. useSofiaFlow.ts continua nunca gravando resposta quando canFillCurrentField=false (guarda de integridade pré-existente, não alterada)", () => {
  const source = fs.readFileSync(new URL("../apps/landing/src/hooks/useSofiaFlow.ts", import.meta.url), "utf8")
  assert.match(source, /const podePreencherComoResposta = classification\.kind === "ANSWER" && classification\.canFillCurrentField/)
  assert.match(source, /const seraInterceptada = !podePreencherComoResposta/)
})

test("D2. classifyForFeature004 nunca lança, mesmo para as frases problemáticas do incidente", () => {
  for (const msg of ["o certo tem que ser exatamente em 30 dias", "precisa pagar o primeiro mostruário", ""]) {
    assert.doesNotThrow(() => classify004(msg, "nome"))
  }
})

test("D3. fallback de erro (conservativeErrorFallback) também não consome nome/cidade com frase de oração completa", () => {
  const fb1 = conservativeErrorFallback({ message: "o certo tem que ser exatamente em 30 dias", currentFieldKey: "nome", currentQuestion: "", fieldKind: "TEXT", expectedValueType: "STRING" })
  assert.equal(fb1.canFillCurrentField, false)
  const fb2 = conservativeErrorFallback({ message: "precisa pagar o primeiro mostruário", currentFieldKey: "cidade", currentQuestion: "", fieldKind: "TEXT", expectedValueType: "STRING" })
  assert.equal(fb2.canFillCurrentField, false)
})

test("D4. fallback de erro continua aceitando 'Moro em Santo André' em cidade (regressão Parte 7.1 2ª rodada, teste 6)", () => {
  const fb = conservativeErrorFallback({ message: "Moro em Santo André", currentFieldKey: "cidade", currentQuestion: "", fieldKind: "TEXT", expectedValueType: "STRING" })
  assert.equal(fb.kind, "ANSWER")
  assert.equal(fb.canFillCurrentField, true)
})

test("D5. looksCompatibleWithCurrentField: nome/cidade rejeitam oração completa, aceitam nome/cidade reais", () => {
  assert.equal(looksCompatibleWithCurrentField("nome", "o certo tem que ser exatamente em 30 dias"), false)
  assert.equal(looksCompatibleWithCurrentField("cidade", "precisa pagar o primeiro mostruário"), false)
  assert.equal(looksCompatibleWithCurrentField("nome", "Maria Aparecida da Silva"), true)
  assert.equal(looksCompatibleWithCurrentField("cidade", "Moro em Mauá"), true)
})

// -----------------------------------------------------------------------
// E) Nenhuma regressão nos exemplos já documentados/aprovados
// -----------------------------------------------------------------------

test("E1. Todos os 18 exemplos de classifyCandidateMessageContextual.examples.ts continuam passando", () => {
  const resultados = runContextualExamples()
  const falhas = resultados.filter((r) => !r.passou)
  assert.deepEqual(falhas, [], `Falhas: ${JSON.stringify(falhas, null, 2)}`)
})

test("E2. Todos os exemplos de classifyForFeature004.examples.ts continuam passando", () => {
  const resultados = runClassifyForFeature004Examples()
  const falhas = resultados.filter((r) => !r.passou)
  assert.deepEqual(falhas, [], `Falhas: ${JSON.stringify(falhas, null, 2)}`)
})
