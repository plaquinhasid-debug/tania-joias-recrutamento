import test from "node:test"
import assert from "node:assert/strict"
import { extractAcceptedAnswerValue } from "../apps/landing/src/orchestrator/extractAcceptedAnswerValue.ts"
import { classifyCandidateMessageContextual } from "../apps/landing/src/orchestrator/classifyCandidateMessageContextual.ts"
import { normalizarCidade, isCidadeAtendida } from "../supabase/functions/finalize-candidate/logic.ts"

const CIDADES_ATENDIDAS = { restringir: true, lista: ["Mauá", "Ribeirão Pires", "Santo André", "São Bernardo do Campo", "São Caetano do Sul"] }

/** Simula exatamente a sequência real de useSofiaFlow.ts: classifica primeiro, só extrai se aceito. */
function classificarEExtrair(fieldKey, rawValue) {
  const classification = classifyCandidateMessageContextual({ message: rawValue, currentFieldKey: fieldKey, currentQuestion: "" })
  const podePreencherComoResposta = classification.kind === "ANSWER" && classification.canFillCurrentField
  if (!podePreencherComoResposta) return { armazenado: null, classification }
  return { armazenado: extractAcceptedAnswerValue(fieldKey, rawValue), classification }
}

// -----------------------------------------------------------------------
// Cidade — prefixos suportados
// -----------------------------------------------------------------------

test("cidade: 'Moro em Mauá' -> extrai 'Mauá'", () => {
  assert.equal(extractAcceptedAnswerValue("cidade", "Moro em Mauá"), "Mauá")
})
test("cidade: 'moro em Santo André' -> extrai 'Santo André'", () => {
  assert.equal(extractAcceptedAnswerValue("cidade", "moro em Santo André"), "Santo André")
})
test("cidade: 'Eu moro em São Caetano do Sul' -> extrai 'São Caetano do Sul'", () => {
  assert.equal(extractAcceptedAnswerValue("cidade", "Eu moro em São Caetano do Sul"), "São Caetano do Sul")
})
test("cidade: 'eu moro em Ribeirão Pires' -> extrai 'Ribeirão Pires'", () => {
  assert.equal(extractAcceptedAnswerValue("cidade", "eu moro em Ribeirão Pires"), "Ribeirão Pires")
})
test("cidade: 'Resido em Mauá' -> extrai 'Mauá'", () => {
  assert.equal(extractAcceptedAnswerValue("cidade", "Resido em Mauá"), "Mauá")
})
test("cidade: 'Eu resido em Santo André' -> extrai 'Santo André'", () => {
  assert.equal(extractAcceptedAnswerValue("cidade", "Eu resido em Santo André"), "Santo André")
})
test("cidade: nomes diretos permanecem intactos", () => {
  assert.equal(extractAcceptedAnswerValue("cidade", "Mauá"), "Mauá")
  assert.equal(extractAcceptedAnswerValue("cidade", "Santo André"), "Santo André")
  assert.equal(extractAcceptedAnswerValue("cidade", "São Bernardo do Campo"), "São Bernardo do Campo")
})
test("cidade: 'Guarulhos' permanece 'Guarulhos' (sem prefixo, sem fuzzy matching)", () => {
  assert.equal(extractAcceptedAnswerValue("cidade", "Guarulhos"), "Guarulhos")
})
test("cidade: prefixo sem nada depois não é removido (evita campo vazio)", () => {
  assert.equal(extractAcceptedAnswerValue("cidade", "moro em"), "moro em")
  assert.equal(extractAcceptedAnswerValue("cidade", "moro em   "), "moro em")
})

// -----------------------------------------------------------------------
// Nome — prefixos suportados
// -----------------------------------------------------------------------

test("nome: 'Meu nome é Maria Aparecida da Silva' -> extrai 'Maria Aparecida da Silva'", () => {
  assert.equal(extractAcceptedAnswerValue("nome", "Meu nome é Maria Aparecida da Silva"), "Maria Aparecida da Silva")
})
test("nome: 'meu nome completo é Maria Aparecida da Silva' -> extrai 'Maria Aparecida da Silva'", () => {
  assert.equal(extractAcceptedAnswerValue("nome", "meu nome completo é Maria Aparecida da Silva"), "Maria Aparecida da Silva")
})
test("nome: 'Eu me chamo Maria Aparecida' -> extrai 'Maria Aparecida'", () => {
  assert.equal(extractAcceptedAnswerValue("nome", "Eu me chamo Maria Aparecida"), "Maria Aparecida")
})
test("nome: 'me chamo João Carlos' -> extrai 'João Carlos'", () => {
  assert.equal(extractAcceptedAnswerValue("nome", "me chamo João Carlos"), "João Carlos")
})
test("nome: nomes diretos permanecem intactos", () => {
  assert.equal(extractAcceptedAnswerValue("nome", "Maria Aparecida da Silva"), "Maria Aparecida da Silva")
  assert.equal(extractAcceptedAnswerValue("nome", "João Carlos"), "João Carlos")
})
test("nome: 'Sou Maria Aparecida' NÃO tem prefixo removido (deliberadamente não suportado)", () => {
  assert.equal(extractAcceptedAnswerValue("nome", "Sou Maria Aparecida"), "Sou Maria Aparecida")
})

// -----------------------------------------------------------------------
// Outros campos — função não deve alterar nada além de espaços
// -----------------------------------------------------------------------

test("outros campos: extractAcceptedAnswerValue não remove nada, só colapsa espaços (comportamento pré-existente)", () => {
  assert.equal(extractAcceptedAnswerValue("profissao", "Trabalho  como   professora"), "Trabalho como professora")
  assert.equal(extractAcceptedAnswerValue("empresa_atual", "  Sou autônoma  "), "Sou autônoma")
  assert.equal(extractAcceptedAnswerValue("objetivo", "Quero renda extra"), "Quero renda extra")
  assert.equal(extractAcceptedAnswerValue("experiencia_vendas", "Nunca vendi"), "Nunca vendi")
  assert.equal(extractAcceptedAnswerValue("tempo_disponivel", "Tenho pouco tempo"), "Tenho pouco tempo")
  assert.equal(extractAcceptedAnswerValue("instagram", "@maria.revende"), "@maria.revende")
  assert.equal(extractAcceptedAnswerValue("whatsapp", "sim"), "sim")
  assert.equal(extractAcceptedAnswerValue("trabalha", "sim"), "sim")
  // Um campo de texto livre não perde "moro em"/"me chamo" mesmo que contenha essas palavras.
  assert.equal(extractAcceptedAnswerValue("objetivo", "Quero me chamo de revendedora"), "Quero me chamo de revendedora")
})

// -----------------------------------------------------------------------
// Score de cidade — pipeline real (classificação real + extração real + isCidadeAtendida real)
// -----------------------------------------------------------------------

test("score: 'Moro em Mauá' -> armazenado 'Mauá' -> isCidadeAtendida=true -> 10 pontos", () => {
  const { armazenado } = classificarEExtrair("cidade", "Moro em Mauá")
  assert.equal(armazenado, "Mauá")
  assert.equal(isCidadeAtendida(armazenado, CIDADES_ATENDIDAS), true)
})

test("score: 'Eu moro em Santo André' -> armazenado 'Santo André' -> isCidadeAtendida=true", () => {
  const { armazenado } = classificarEExtrair("cidade", "Eu moro em Santo André")
  assert.equal(armazenado, "Santo André")
  assert.equal(isCidadeAtendida(armazenado, CIDADES_ATENDIDAS), true)
})

test("score: 'moro em São Caetano do Sul' -> armazenado 'São Caetano do Sul' -> isCidadeAtendida=true", () => {
  const { armazenado } = classificarEExtrair("cidade", "moro em São Caetano do Sul")
  assert.equal(armazenado, "São Caetano do Sul")
  assert.equal(isCidadeAtendida(armazenado, CIDADES_ATENDIDAS), true)
})

test("score: 'Guarulhos' -> armazenado 'Guarulhos' -> isCidadeAtendida=false (cidade real fora da lista, nunca deve virar true)", () => {
  const { armazenado } = classificarEExtrair("cidade", "Guarulhos")
  assert.equal(armazenado, "Guarulhos")
  assert.equal(isCidadeAtendida(armazenado, CIDADES_ATENDIDAS), false)
})

test("isCidadeAtendida não foi alterado — normalizarCidade continua igual (RFC-INTELLIGENCE-007)", () => {
  assert.equal(normalizarCidade("Santo André, SP"), "santo andre")
  assert.equal(normalizarCidade("MAUÁ"), "maua")
})

// -----------------------------------------------------------------------
// Nome — pipeline real + primeiro nome (mesma extração usada por finalize-candidate/logic.ts:206)
// -----------------------------------------------------------------------

test("nome: 'Meu nome é Maria Aparecida da Silva' -> armazenado 'Maria Aparecida da Silva' -> primeiro nome 'Maria'", () => {
  const { armazenado } = classificarEExtrair("nome", "Meu nome é Maria Aparecida da Silva")
  assert.equal(armazenado, "Maria Aparecida da Silva")
  assert.equal(armazenado.split(" ")[0], "Maria")
})

test("nome: 'Eu me chamo João Carlos' -> armazenado 'João Carlos' -> primeiro nome 'João'", () => {
  const { armazenado } = classificarEExtrair("nome", "Eu me chamo João Carlos")
  assert.equal(armazenado, "João Carlos")
  assert.equal(armazenado.split(" ")[0], "João")
})

test("nome: 'Maria Aparecida' direto permanece intacto pelo pipeline completo", () => {
  const { armazenado } = classificarEExtrair("nome", "Maria Aparecida")
  assert.equal(armazenado, "Maria Aparecida")
})

// -----------------------------------------------------------------------
// Interação com a 012E — perguntas/dúvidas continuam interceptadas (nunca chegam à extração)
// -----------------------------------------------------------------------

test("012E continua funcionando: nome + 'quanto eu ganho de comissão' NÃO é armazenado", () => {
  const { armazenado, classification } = classificarEExtrair("nome", "quanto eu ganho de comissão")
  assert.equal(armazenado, null)
  assert.equal(classification.canFillCurrentField, false)
})

test("012E continua funcionando: nome + 'o acerto tem que ser exatamente em 30 dias' NÃO é armazenado", () => {
  const { armazenado, classification } = classificarEExtrair("nome", "o acerto tem que ser exatamente em 30 dias")
  assert.equal(armazenado, null)
  assert.equal(classification.canFillCurrentField, false)
})

test("012E continua funcionando: nome + 'tenho dúvida sobre a garantia' NÃO é armazenado", () => {
  const { armazenado, classification } = classificarEExtrair("nome", "tenho dúvida sobre a garantia")
  assert.equal(armazenado, null)
  assert.equal(classification.kind, "DOUBT")
})

test("012E continua funcionando: cidade + 'quanto é a comissão' NÃO é armazenado", () => {
  const { armazenado, classification } = classificarEExtrair("cidade", "quanto é a comissão")
  assert.equal(armazenado, null)
  assert.equal(classification.canFillCurrentField, false)
})

// -----------------------------------------------------------------------
// Regressão explícita: 'Moro em Mauá' continua sendo ACEITO como resposta
// (a 012E não deve rejeitar isso — só a 012F deve limpar o valor).
// -----------------------------------------------------------------------

test("'Moro em Mauá' continua classificado como ANSWER em cidade (012E não regrediu isso)", () => {
  const r = classifyCandidateMessageContextual({ message: "Moro em Mauá", currentFieldKey: "cidade", currentQuestion: "" })
  assert.equal(r.kind, "ANSWER")
  assert.equal(r.canFillCurrentField, true)
})
