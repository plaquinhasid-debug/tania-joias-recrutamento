import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import {
  SOFIA_STEPS,
  findNextStepIndex,
  isInstagramSkipSignal,
} from "../apps/landing/src/data/sofia-script.ts"
import { classifyCandidateMessageContextual } from "../apps/landing/src/orchestrator/classifyCandidateMessageContextual.ts"
import { runContextualExamples } from "../apps/landing/src/orchestrator/classifyCandidateMessageContextual.examples.ts"
import { runClassifyForFeature004Examples } from "../apps/landing/src/orchestrator/classifyForFeature004.examples.ts"
import {
  calcularElegibilidade,
  calcularIpr,
  decidirStatus,
} from "../supabase/functions/finalize-candidate/logic.ts"
import { runFinalizeCandidateLogicExamples } from "../supabase/functions/finalize-candidate/finalize-candidate.examples.ts"

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8")
const useSofiaFlowSource = read("../apps/landing/src/hooks/useSofiaFlow.ts")
const sofiaScriptSource = read("../apps/landing/src/data/sofia-script.ts")

// Mesmos números reais de produção (settings.ipr_pesos / ipr_thresholds).
const PESOS = { trabalha: 50, experiencia_vendas: 20, whatsapp: 10, instagram: 10, cidade_atendida: 10 }
const THRESHOLDS = { aprovar: 80, analise_min: 60 }

function decidir(payload, cidadeAtendida = true) {
  const { elegivel } = calcularElegibilidade(payload)
  const { total, breakdown } = calcularIpr(payload, PESOS, cidadeAtendida, elegivel)
  return { elegivel, ipr: total, breakdown, status: decidirStatus(elegivel, total, THRESHOLDS) }
}

const instagramStep = SOFIA_STEPS.find((s) => s.key === "instagram")
const instagramIndex = SOFIA_STEPS.findIndex((s) => s.key === "instagram")

// ---------------------------------------------------------------------------
// 1. "@usuario" -> avança (aceito como handle informado)
// ---------------------------------------------------------------------------
test("1. '@maria.revende' NÃO é sinal de pular -> vira valor informado", () => {
  assert.equal(isInstagramSkipSignal("@maria.revende"), false)
})
test("1b. '@ana_vendas' NÃO é sinal de pular", () => {
  assert.equal(isInstagramSkipSignal("@ana_vendas"), false)
})

// ---------------------------------------------------------------------------
// 2. "usuario" (sem @) -> não fica preso
// ---------------------------------------------------------------------------
test("2. 'anavendasjoias' (sem @) NÃO é sinal de pular -> vira valor informado", () => {
  assert.equal(isInstagramSkipSignal("anavendasjoias"), false)
})

// ---------------------------------------------------------------------------
// 3. nome de perfil / negócio com espaços -> não fica preso
//    (reprodução do caso real: "Studio marcia Silva", 9 tentativas + abandono)
// ---------------------------------------------------------------------------
test("3. 'Studio marcia Silva' NÃO é sinal de pular -> vira valor informado (caso real do loop)", () => {
  assert.equal(isInstagramSkipSignal("Studio marcia Silva"), false)
})
test("3b. 'Loja da Ana - semijoias' NÃO é sinal de pular", () => {
  assert.equal(isInstagramSkipSignal("Loja da Ana - semijoias"), false)
})

// ---------------------------------------------------------------------------
// 4. "não sei" / "não lembro" -> avança SEM Instagram
// ---------------------------------------------------------------------------
test("4. 'não sei' é sinal de pular", () => {
  assert.equal(isInstagramSkipSignal("não sei"), true)
})
test("4b. 'Não lembro meu @' é sinal de pular", () => {
  assert.equal(isInstagramSkipSignal("Não lembro meu @"), true)
})
test("4c. 'não sei.' (com pontuação) é sinal de pular", () => {
  assert.equal(isInstagramSkipSignal("não sei."), true)
})

// ---------------------------------------------------------------------------
// 5. "não uso muito" -> avança SEM Instagram (frase exata do caso real)
// ---------------------------------------------------------------------------
test("5. 'não uso muito' é sinal de pular", () => {
  assert.equal(isInstagramSkipSignal("não uso muito"), true)
})
test("5b. 'N uso muito.' (abreviado, frase EXATA do abandono real) é sinal de pular", () => {
  assert.equal(isInstagramSkipSignal("N uso muito."), true)
})
test("5c. 'não tenho' / 'não tenho instagram' / 'sem instagram' são sinais de pular", () => {
  assert.equal(isInstagramSkipSignal("não tenho"), true)
  assert.equal(isInstagramSkipSignal("não tenho instagram"), true)
  assert.equal(isInstagramSkipSignal("sem instagram"), true)
})
test("5d. 'não' isolado / 'pular' são sinais de pular; vazio também", () => {
  assert.equal(isInstagramSkipSignal("não"), true)
  assert.equal(isInstagramSkipSignal("pular"), true)
  assert.equal(isInstagramSkipSignal("   "), true)
})

// ---------------------------------------------------------------------------
// Sem falso positivo: um @ real que contenha "nao" não pode ser lido como pular
// ---------------------------------------------------------------------------
test("Sem falso positivo: '@nao_para_de_vender' NÃO é sinal de pular", () => {
  assert.equal(isInstagramSkipSignal("@nao_para_de_vender"), false)
})
test("Sem falso positivo: 'joana' NÃO é sinal de pular", () => {
  assert.equal(isInstagramSkipSignal("joana"), false)
})

// ---------------------------------------------------------------------------
// 6. candidata que pula Instagram consegue chegar às próximas perguntas
// ---------------------------------------------------------------------------
test("6. etapa 'instagram' NÃO é a última — depois dela ainda vêm tempo_disponivel e objetivo", () => {
  assert.ok(instagramIndex >= 0)
  assert.ok(instagramIndex < SOFIA_STEPS.length - 1)
  assert.deepEqual(
    SOFIA_STEPS.slice(instagramIndex + 1).map((s) => s.key),
    ["tempo_disponivel", "objetivo"],
  )
})
test("6b. findNextStepIndex após 'instagram' (trabalha=true) -> 'tempo_disponivel'", () => {
  const answers = { trabalha: true, possui_instagram: true, instagram: null }
  const next = findNextStepIndex(instagramIndex + 1, answers)
  assert.equal(SOFIA_STEPS[next].key, "tempo_disponivel")
})
test("6c. useSofiaFlow: o ramo do instagram chama advanceAfterAnswer e dá return (segue o fluxo, sem loop)", () => {
  const marcador = 'if (step.key === "instagram" && typeof value === "string") {'
  const idx = useSofiaFlowSource.indexOf(marcador)
  assert.ok(idx > -1, "ramo do instagram não encontrado em submitAnswer")
  const bloco = useSofiaFlowSource.slice(idx, idx + 400) // cobre só o corpo do ramo
  assert.match(bloco, /provisionalAnswers\.instagram = isInstagramSkipSignal\(value\) \? null : value\.trim\(\)/)
  assert.match(bloco, /advanceAfterAnswer\(provisionalAnswers, stepIndex \+ 1, step\.key\)/)
  assert.match(bloco, /\breturn\s+}/)
  // o ramo não invoca os re-perguntadores que causavam o loop
  assert.doesNotMatch(bloco, /handleNonAnswerMessage|handleCandidateQuestion|classifyMessageForFeature004/)
})
test("6d. o ramo do instagram vem ANTES do bloco do classificador contextual (que é a origem do loop)", () => {
  const posRamo = useSofiaFlowSource.indexOf('if (step.key === "instagram" && typeof value === "string") {')
  const posClassificador = useSofiaFlowSource.indexOf("classifyMessageForFeature004({")
  assert.ok(posRamo > -1, "ramo do instagram não encontrado em submitAnswer")
  assert.ok(posClassificador > -1, "bloco do classificador não encontrado")
  assert.ok(posRamo < posClassificador, "o ramo do instagram precisa curto-circuitar ANTES do classificador")
})

// ---------------------------------------------------------------------------
// 7. fluxo normal existente continua funcionando
// ---------------------------------------------------------------------------
test("7. sequência do roteiro inalterada — 14 etapas, mesmas chaves na mesma ordem", () => {
  assert.deepEqual(
    SOFIA_STEPS.map((s) => s.key),
    [
      "nome", "cidade", "idade", "telefone", "trabalha", "profissao", "empresa_atual",
      "estabilidade_profissional", "experiencia_vendas", "whatsapp", "possui_instagram",
      "instagram", "tempo_disponivel", "objetivo",
    ],
  )
})
test("7b. a pergunta central do @ do Instagram foi PRESERVADA", () => {
  assert.match(instagramStep.question, /Qual é o seu @ do Instagram\?/)
})
test("7c. o schema do @ do Instagram continua aceitando um handle normal", () => {
  assert.equal(instagramStep.schema.safeParse("@maria.revende").success, true)
  assert.equal(instagramStep.schema.safeParse("maria.revende").success, true)
  // e continua aceitando a frase de pular (não é gate — quem pula digita algo)
  assert.equal(instagramStep.schema.safeParse("não tenho").success, true)
  // string vazia continua sendo rejeitada pelo input (precisa escrever algo)
  assert.equal(instagramStep.schema.safeParse("   ").success, false)
})
test("7d. etapa 'instagram' ainda é pulada quando possui_instagram !== true", () => {
  assert.equal(instagramStep.skip({ trabalha: true, possui_instagram: false }), true)
  assert.equal(instagramStep.skip({ trabalha: true, possui_instagram: undefined }), true)
  assert.equal(instagramStep.skip({ trabalha: true, possui_instagram: true }), false)
})
test("7e. classificador contextual NÃO foi alterado — '@maria.revende' segue ANSWER em instagram", () => {
  const r = classifyCandidateMessageContextual({ message: "@maria.revende", currentFieldKey: "instagram", currentQuestion: "" })
  assert.equal(r.kind, "ANSWER")
  assert.equal(r.canFillCurrentField, true)
})
test("7f. classificador contextual NÃO foi alterado — nome/cidade seguem rejeitando oração/pergunta", () => {
  const nome = classifyCandidateMessageContextual({ message: "o certo tem que ser exatamente em 30 dias", currentFieldKey: "nome", currentQuestion: "" })
  assert.equal(nome.canFillCurrentField, false)
  const cidade = classifyCandidateMessageContextual({ message: "quanto é a comissão", currentFieldKey: "cidade", currentQuestion: "" })
  assert.equal(cidade.canFillCurrentField, false)
})
test("7g. suítes de exemplo do classificador continuam 100% verdes", () => {
  const contextual = runContextualExamples().filter((r) => !r.passou)
  assert.deepEqual(contextual, [], `Falhas contextual: ${JSON.stringify(contextual, null, 2)}`)
  const feature004 = runClassifyForFeature004Examples().filter((r) => !r.passou)
  assert.deepEqual(feature004, [], `Falhas feature004: ${JSON.stringify(feature004, null, 2)}`)
})

// ---------------------------------------------------------------------------
// 8. regras de aprovação existentes continuam funcionando
// ---------------------------------------------------------------------------
test("8. suíte de exemplos de aprovação (finalize-candidate/logic) continua 100% verde", () => {
  const falhas = runFinalizeCandidateLogicExamples().filter((r) => !r.passou)
  assert.deepEqual(falhas, [], `Falhas: ${JSON.stringify(falhas, null, 2)}`)
})

// ---------------------------------------------------------------------------
// E) efeito exato no IPR quando a candidata pula o Instagram
// ---------------------------------------------------------------------------
test("E1. pular Instagram (instagram=null) NUNCA reprova uma candidata elegível", () => {
  // elegível = trabalha + idade>=18 + whatsapp. Sem Instagram, sem experiência,
  // fora da cidade atendida -> pior caso possível de quem pula.
  const piorCaso = decidir(
    { session_id: "t", nome: "X", telefone: "11999999999", trabalha: true, idade: 30, whatsapp: true, experiencia_vendas: false, instagram: null },
    false,
  )
  assert.equal(piorCaso.elegivel, true)
  assert.notEqual(piorCaso.status, "reprovada")
  assert.ok(piorCaso.ipr >= THRESHOLDS.analise_min) // >= 60, cai no máximo em em_analise
})
test("E2. presença do Instagram continua somando exatamente os 10 pontos (semântica preservada)", () => {
  const base = { session_id: "t", nome: "X", telefone: "11999999999", trabalha: true, idade: 30, whatsapp: true, experiencia_vendas: false }
  const comIg = decidir({ ...base, instagram: "@x" }, false)
  const semIg = decidir({ ...base, instagram: null }, false)
  assert.equal(comIg.breakdown.instagram, 10)
  assert.equal(semIg.breakdown.instagram, 0)
  assert.equal(comIg.ipr - semIg.ipr, 10)
})
test("E3. único efeito de pular: candidata que seria 'aprovada' no limite pode cair para 'em_analise' (revisão manual), nunca reprovada", () => {
  // trabalha(50) + whatsapp(10) + cidade(10) + instagram(10) = 80 -> aprovada
  // sem instagram -> 70 -> em_analise
  const base = { session_id: "t", nome: "X", telefone: "11999999999", trabalha: true, idade: 30, whatsapp: true, experiencia_vendas: false }
  assert.equal(decidir({ ...base, instagram: "@x" }, true).status, "aprovada")
  assert.equal(decidir({ ...base, instagram: null }, true).status, "em_analise")
})
test("E4. calcularElegibilidade ignora Instagram por completo (não é gate)", () => {
  const p = (instagram) => calcularElegibilidade({ session_id: "t", nome: "X", telefone: "1", trabalha: true, idade: 30, whatsapp: true, instagram })
  assert.deepEqual(p("@x"), p(null))
  assert.equal(p(null).elegivel, true)
})
test("E5. sofia-script documenta que Instagram não é gate e que pular só deixa de somar pontos", () => {
  assert.match(sofiaScriptSource, /n[aã]o (?:é|e) gate de elegibilidade/i)
  assert.match(sofiaScriptSource, /nunca (?:é reprovada|reprova)/i)
})
