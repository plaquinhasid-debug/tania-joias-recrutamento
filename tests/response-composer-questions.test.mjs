import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { composeResponse } from "../apps/landing/src/orchestrator/composer/ResponseComposer.ts"
import { findTransitionKind } from "../apps/landing/src/orchestrator/composer/TransitionLibrary.ts"
import { answerCandidateQuestion } from "../apps/landing/src/orchestrator/pipeline/answerCandidateQuestion.ts"

const countQuestionMarks = (texto) => (texto.match(/\?/g) ?? []).length

const AI_RESPONSE_WITH_QUESTION =
  "A comissão varia de 30% a 40%, dependendo do que você vende em cada ciclo! Até R$ 299 você recebe 30%; " +
  "de R$ 299 a R$ 399 é 35%; acima de R$ 400 é 40%. Quanto mais você vende, maior seu percentual. Faz sentido?"

const AI_RESPONSE_WITHOUT_QUESTION =
  "A comissão varia de 30% a 40%, dependendo do que você vende em cada ciclo. Até R$ 299 você recebe 30%; " +
  "de R$ 299 a R$ 399 é 35%; acima de R$ 400 é 40%. Quanto mais você vende, maior seu percentual."

// --- REPRODUÇÃO: prova, com aleatoriedade real, que o código ATUAL (pós-fix)
// nunca mais descarta uma resposta válida por MULTIPLE_QUESTIONS neste
// cenário. Antes do fix (IMPLEMENTATION-012B), rodar isto reproduzia o bug
// em ~1/3 das tentativas (confirmado ao vivo: 4/10 numa amostra real contra
// o agent-ai-gateway real). Não é teste estático: usa Math.random() de
// verdade, sem mock, exatamente como pickTransition() usa em produção.
test("resposta da IA com pergunta própria nunca é descartada por MULTIPLE_QUESTIONS (200 tentativas, aleatoriedade real)", () => {
  let fallbacks = 0
  for (let i = 0; i < 200; i++) {
    const result = composeResponse({ aiResponse: AI_RESPONSE_WITH_QUESTION, currentQuestion: undefined, intent: "QUESTION" })
    if (!result.aiContentUsed) fallbacks++
    assert.equal(result.aiContentUsed, true, `tentativa ${i}: conteúdo da IA foi descartado — transition="${result.transition}" violations=${JSON.stringify(result.policyViolations)}`)
    assert.ok(countQuestionMarks(result.message) <= 1, `tentativa ${i}: mensagem final com mais de 1 pergunta — "${result.message}"`)
    assert.deepEqual(result.policyViolations, [])
  }
  assert.equal(fallbacks, 0)
})

test("transição sorteada nunca é interrogativa quando o conteúdo da IA já tem pergunta própria (200 tentativas)", () => {
  for (let i = 0; i < 200; i++) {
    const result = composeResponse({ aiResponse: AI_RESPONSE_WITH_QUESTION, currentQuestion: undefined, intent: "QUESTION" })
    assert.equal(findTransitionKind(result.transition), "DECLARATIVE", `tentativa ${i}: transição interrogativa escolhida junto com pergunta própria da IA: "${result.transition}"`)
  }
})

test("resposta da IA sem pergunta própria pode receber transição interrogativa normalmente (biblioteca completa continua acessível)", () => {
  const kindsVistos = new Set()
  for (let i = 0; i < 200; i++) {
    const result = composeResponse({ aiResponse: AI_RESPONSE_WITHOUT_QUESTION, currentQuestion: undefined, intent: "QUESTION" })
    assert.equal(result.aiContentUsed, true)
    kindsVistos.add(findTransitionKind(result.transition))
  }
  // Confirma que a correção não restringiu a variedade de transições quando não há risco de colisão.
  assert.ok(kindsVistos.has("DECLARATIVE"))
  assert.ok(kindsVistos.has("INTERROGATIVE"))
})

test("mock determinístico: forçar índice da transição interrogativa não produz 2 perguntas quando a IA já perguntou", () => {
  const originalRandom = Math.random
  try {
    // TRANSITIONS = [DECLARATIVE, INTERROGATIVE, INTERROGATIVE, DECLARATIVE, DECLARATIVE, DECLARATIVE] (6 itens).
    // random()=0.2 -> Math.floor(0.2*6)=1 -> "Me ajuda com mais uma informação?" (INTERROGATIVE) SE não filtrado.
    Math.random = () => 0.2
    const result = composeResponse({ aiResponse: AI_RESPONSE_WITH_QUESTION, currentQuestion: undefined, intent: "QUESTION" })
    assert.equal(result.aiContentUsed, true)
    assert.equal(findTransitionKind(result.transition), "DECLARATIVE")
    assert.equal(countQuestionMarks(result.message), 1)
    assert.deepEqual(result.policyViolations, [])
  } finally {
    Math.random = originalRandom
  }
})

test("comportamento pré-existente preservado: pergunta do roteiro (hasScriptQuestion) continua forçando transição declarativa", () => {
  const result = composeResponse({
    aiResponse: AI_RESPONSE_WITHOUT_QUESTION,
    currentQuestion: "Qual é o seu nome completo?",
    intent: "QUESTION",
  })
  assert.equal(findTransitionKind(result.transition), "DECLARATIVE")
})

test("comportamento pré-existente preservado: IA com pergunta própria E pergunta do roteiro continua descartando o conteúdo (MULTIPLE_QUESTIONS)", () => {
  const result = composeResponse({
    aiResponse: AI_RESPONSE_WITH_QUESTION,
    currentQuestion: "Qual é o seu nome completo?",
    intent: "QUESTION",
  })
  assert.equal(result.aiContentUsed, false)
  assert.ok(result.policyViolations.some((v) => v.code === "MULTIPLE_QUESTIONS"))
  assert.equal(countQuestionMarks(result.message), 1)
})

// --- Pipeline completo (answerCandidateQuestion → KnowledgeEngine → composeResponse),
// reproduzindo os 4 tópicos do PILOT e um fora da allowlist, em LOCAL e SHADOW,
// sem nunca ativar PILOT nesta tarefa.
const fakeGateway = (mensagem) => ({ request: async () => ({ content: mensagem, provider: "fake", model: "fake", latencyMs: 1 }) })

const CENARIOS = [
  ["comissão", "quanto eu vou ganhar de comissão?", "A comissão varia de 30% a 40% conforme o valor vendido. Faz sentido?"],
  ["garantia", "quanto tempo de garantia tem a peça?", "Anéis têm 3 meses de garantia; as demais peças têm 6 meses. Ficou claro?"],
  ["30 dias", "quanto tempo até o acerto?", "O acerto é por volta de 30 dias, sem ser um prazo rígido. Isso ajuda?"],
  ["primeiro mostruário", "preciso pagar algo pra começar?", "Não! O primeiro mostruário é consignado, sem pagamento antecipado. Combinado?"],
  ["fora da allowlist (idade)", "qual a idade mínima?", "A idade mínima é 18 anos completos. Tudo certo?"],
]

for (const [rotulo, pergunta, respostaIa] of CENARIOS) {
  for (const modo of ["LOCAL", "SHADOW"]) {
    test(`pipeline real (${modo}) — pergunta de ${rotulo} nunca cai no fallback de informação imprecisa`, async () => {
      const resultado = await answerCandidateQuestion({
        pergunta,
        sessionId: `test-012b-${modo}-${rotulo}`,
        knowledgeSourceMode: modo,
        aiGateway: fakeGateway(respostaIa),
      })
      assert.equal(resultado.iaChamada, true, `nenhum documento encontrado para "${pergunta}" em ${modo}`)
      assert.equal(resultado.composed.aiContentUsed, true, `resposta descartada: ${JSON.stringify(resultado.composed.policyViolations)}`)
      assert.notEqual(resultado.composed.message, "Prefiro não passar uma informação imprecisa neste momento.")
      assert.ok(countQuestionMarks(resultado.composed.message) <= 1)
    })
  }
}

test("pipeline mantém exatamente uma chamada ao gateway de IA por pergunta (sem duplicar resposta)", async () => {
  let chamadas = 0
  const gateway = { request: async () => { chamadas++; return { content: AI_RESPONSE_WITH_QUESTION, provider: "fake", model: "fake", latencyMs: 1 } } }
  await answerCandidateQuestion({ pergunta: "quanto eu vou ganhar de comissão?", sessionId: "test-012b-single-call", knowledgeSourceMode: "SHADOW", aiGateway: gateway })
  assert.equal(chamadas, 1)
})

// --- Wizard: confirma que useSofiaFlow.ts continua retomando a pergunta do
// roteiro como segunda bolha, incondicionalmente, após tratar a pergunta da
// candidata — comportamento pré-existente (FEATURE-004), NÃO alterado por
// esta correção (que só toca ResponseComposer.ts/ResponsePolicies.ts).
test("useSofiaFlow retoma a pergunta do roteiro (segunda bolha) após responder à pergunta da candidata, sem passar currentQuestion pro composer", () => {
  const source = fs.readFileSync(new URL("../apps/landing/src/hooks/useSofiaFlow.ts", import.meta.url), "utf8")
  const handleCandidateQuestionBlock = source.slice(
    source.indexOf("const handleCandidateQuestion"),
    source.indexOf("const handleCandidateQuestion") + 1200,
  )
  assert.match(handleCandidateQuestionBlock, /answerCandidateQuestion\(\{/)
  assert.doesNotMatch(handleCandidateQuestionBlock, /currentQuestion:/)
  assert.match(handleCandidateQuestionBlock, /pushBotLine\(step\.question, 450\)/)
})

test("ResponseComposer não ganhou parâmetro novo de entrada (fix é só interno)", () => {
  const source = fs.readFileSync(new URL("../apps/landing/src/orchestrator/composer/types.ts", import.meta.url), "utf8")
  const inputBlock = source.slice(source.indexOf("interface ComposeResponseInput"), source.indexOf("export type PolicyViolationCode"))
  const camposContados = (inputBlock.match(/^\s*\w+\??:/gm) ?? []).length
  assert.equal(camposContados, 7)
})
