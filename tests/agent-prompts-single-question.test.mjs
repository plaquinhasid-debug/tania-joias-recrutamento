import test from "node:test"
import assert from "node:assert/strict"
import { composeMessageFromToolOutput, AgentAiError } from "../supabase/functions/_shared/agent-prompts.ts"

const countQ = (texto) => (texto.match(/\?/g) ?? []).length

function assertInvalidResponse(fn) {
  assert.throws(fn, (err) => err instanceof AgentAiError && err.code === "AI_INVALID_RESPONSE")
}

// -----------------------------------------------------------------------
// Reprodução exata dos casos reais que falharam na IMPLEMENTATION-012H
// -----------------------------------------------------------------------

test("reprodução real 012H: 2 perguntas dentro do MESMO optional_question -> rejeitado (AI_INVALID_RESPONSE), nunca mascarado", () => {
  assertInvalidResponse(() =>
    composeMessageFromToolOutput({
      answer_text:
        "A garantia varia conforme o tipo de peça. Os anéis têm 3 meses de garantia, e as outras peças — colares, brincos, pulseiras, correntes, pingentes — têm 6 meses. A garantia não cobre problemas por mau uso ou oxidação, tá bem?",
      optional_question: "Isso faz sentido pra você?",
    }),
  )
})

test("reprodução real 012H: pergunta retórica + pergunta de qualificação somadas -> rejeitado", () => {
  assertInvalidResponse(() =>
    composeMessageFromToolOutput({
      answer_text: "Nossas peças têm garantia sim. Os anéis são cobertos por 3 meses, e as demais peças têm 6 meses de garantia. O que não cobre é mau uso ou oxidação por mau uso.",
      optional_question: "E aí, está comigo nessa jornada de revender conosco? Qual é sua experiência com vendas até agora?",
    }),
  )
})

// -----------------------------------------------------------------------
// Casos válidos — os 5 tópicos exigidos, com resposta factual + no máximo
// 1 pergunta curta de verificação de entendimento (nunca de qualificação).
// -----------------------------------------------------------------------

test("comissão: answer_text sem pergunta + optional_question curta -> compõe corretamente, 1 pergunta só", () => {
  const message = composeMessageFromToolOutput({
    answer_text:
      "A comissão varia de 30% a 40% conforme o valor vendido. Até R$ 299,00 é 30%; de R$ 299,01 a R$ 399,99 é 35%; a partir de R$ 400,00 é 40%.",
    optional_question: "Faz sentido pra você?",
  })
  assert.equal(countQ(message), 1)
  assert.match(message, /30%/)
  assert.match(message, /40%/)
})

test("garantia: answer_text sem pergunta + optional_question curta -> compõe corretamente", () => {
  const message = composeMessageFromToolOutput({
    answer_text: "Os anéis têm 3 meses de garantia, e as demais peças têm 6 meses. A garantia não cobre mau uso ou oxidação.",
    optional_question: "Ficou claro?",
  })
  assert.equal(countQ(message), 1)
  assert.match(message, /3 meses/)
  assert.match(message, /6 meses/)
})

test("30 dias: answer_text sem pergunta + optional_question curta -> compõe corretamente", () => {
  const message = composeMessageFromToolOutput({
    answer_text: "O acerto é uma referência de aproximadamente 30 dias, não um prazo rígido — pode ser antecipado, adiado ou reagendado combinando com a equipe.",
    optional_question: "Isso ajuda a esclarecer?",
  })
  assert.equal(countQ(message), 1)
  assert.match(message, /30 dias/)
})

test("primeiro mostruário: answer_text sem pergunta + optional_question curta -> compõe corretamente", () => {
  const message = composeMessageFromToolOutput({
    answer_text: "Não! O primeiro mostruário é consignado, sem pagamento antecipado, sem taxa de adesão e sem caução.",
    optional_question: "Ficou tranquilo agora?",
  })
  assert.equal(countQ(message), 1)
  assert.match(message, /consignado/)
})

test("fora da allowlist (idade): answer_text sem pergunta + optional_question curta -> compõe corretamente", () => {
  const message = composeMessageFromToolOutput({
    answer_text: "A idade mínima para se candidatar é 18 anos completos.",
    optional_question: "Faz sentido?",
  })
  assert.equal(countQ(message), 1)
  assert.match(message, /18 anos/)
})

// -----------------------------------------------------------------------
// optional_question ausente/null/vazia -> resposta com ZERO perguntas, válida
// -----------------------------------------------------------------------

test("optional_question = null -> mensagem final sem nenhuma pergunta", () => {
  const message = composeMessageFromToolOutput({ answer_text: "A comissão varia de 30% a 40%.", optional_question: null })
  assert.equal(countQ(message), 0)
  assert.equal(message, "A comissão varia de 30% a 40%.")
})

test("optional_question ausente -> mensagem final sem nenhuma pergunta", () => {
  const message = composeMessageFromToolOutput({ answer_text: "A comissão varia de 30% a 40%." })
  assert.equal(countQ(message), 0)
})

test("optional_question = string vazia -> tratada como sem pergunta", () => {
  const message = composeMessageFromToolOutput({ answer_text: "A comissão varia de 30% a 40%.", optional_question: "" })
  assert.equal(countQ(message), 0)
  assert.equal(message, "A comissão varia de 30% a 40%.")
})

// -----------------------------------------------------------------------
// Rede de segurança estrutural — nunca mascara, sempre rejeita
// -----------------------------------------------------------------------

test("2 perguntas só dentro de answer_text (sem optional_question) -> rejeitado", () => {
  assertInvalidResponse(() =>
    composeMessageFromToolOutput({ answer_text: "Você já vendeu antes? E tem WhatsApp?", optional_question: null }),
  )
})

test("1 pergunta em answer_text + 1 em optional_question (total 2, cada campo isolado tem só 1) -> rejeitado", () => {
  assertInvalidResponse(() =>
    composeMessageFromToolOutput({
      answer_text: "Você já vendeu antes?",
      optional_question: "Isso ajuda?",
    }),
  )
})

test("answer_text ausente -> AI_INVALID_RESPONSE", () => {
  assertInvalidResponse(() => composeMessageFromToolOutput({ optional_question: "Faz sentido?" }))
})

test("answer_text vazio/só espaços -> AI_INVALID_RESPONSE", () => {
  assertInvalidResponse(() => composeMessageFromToolOutput({ answer_text: "   ", optional_question: null }))
})

test("toolInput undefined (tool_use ausente/malformado) -> AI_INVALID_RESPONSE, nunca lança erro genérico", () => {
  assertInvalidResponse(() => composeMessageFromToolOutput(undefined))
})

test("nunca corta/edita texto — 0 ou 1 pergunta sempre passa como está, sem transformação de conteúdo", () => {
  const semPergunta = composeMessageFromToolOutput({ answer_text: "Resposta objetiva sem pergunta nenhuma.", optional_question: null })
  assert.equal(semPergunta, "Resposta objetiva sem pergunta nenhuma.")
  const comUmaPergunta = composeMessageFromToolOutput({ answer_text: "Resposta objetiva.", optional_question: "Faz sentido?" })
  assert.equal(comUmaPergunta, "Resposta objetiva. Faz sentido?")
})
