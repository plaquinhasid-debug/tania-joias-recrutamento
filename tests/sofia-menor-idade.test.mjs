import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { IDADE_MINIMA, isMenorDeIdade, SOFIA_MENOR_IDADE_LINES, SOFIA_STEPS } from "../apps/landing/src/data/sofia-script.ts"
import { identificacaoSchema } from "../packages/shared/src/schemas.ts"

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8")

// -----------------------------------------------------------------------
// isMenorDeIdade — lógica pura que decide o encerramento
// -----------------------------------------------------------------------

test("IDADE_MINIMA é 18, igual ao gate server-side (finalize-candidate/logic.ts)", () => {
  assert.equal(IDADE_MINIMA, 18)
})
test("17 anos é menor de idade", () => assert.equal(isMenorDeIdade(17), true))
test("16 anos é menor de idade", () => assert.equal(isMenorDeIdade(16), true))
test("1 ano é menor de idade (limite inferior aceito pelo schema)", () => assert.equal(isMenorDeIdade(1), true))
test("18 anos NÃO é menor de idade", () => assert.equal(isMenorDeIdade(18), false))
test("28 anos NÃO é menor de idade", () => assert.equal(isMenorDeIdade(28), false))
test("99 anos NÃO é menor de idade", () => assert.equal(isMenorDeIdade(99), false))

// -----------------------------------------------------------------------
// Schema da etapa "idade" no wizard — precisa ACEITAR menores de 18 (pra
// dar chance da resposta ser processada conversacionalmente), diferente do
// schema compartilhado `identificacaoSchema`, que continua rejeitando.
// -----------------------------------------------------------------------

const idadeStep = SOFIA_STEPS.find((step) => step.key === "idade")

test("etapa 'idade' do wizard existe e tem schema próprio", () => {
  assert.ok(idadeStep)
  assert.ok(idadeStep.schema)
})
test("schema da etapa 'idade' ACEITA 17 (a resposta precisa ser capturada, não rejeitada como erro de formulário)", () => {
  assert.equal(idadeStep.schema.safeParse(17).success, true)
})
test("schema da etapa 'idade' ACEITA 18 e 28 normalmente", () => {
  assert.equal(idadeStep.schema.safeParse(18).success, true)
  assert.equal(idadeStep.schema.safeParse(28).success, true)
})
test("schema da etapa 'idade' ainda rejeita entrada não numérica e fora de faixa sã", () => {
  assert.equal(idadeStep.schema.safeParse("abc").success, false)
  assert.equal(idadeStep.schema.safeParse(200).success, false)
  assert.equal(idadeStep.schema.safeParse(0).success, false)
})
test("schema COMPARTILHADO (identificacaoSchema.idade) continua com o mínimo de 18 — regressão", () => {
  assert.equal(identificacaoSchema.shape.idade.safeParse(17).success, false)
  assert.equal(identificacaoSchema.shape.idade.safeParse(16).success, false)
  assert.equal(identificacaoSchema.shape.idade.safeParse(18).success, true)
})

// -----------------------------------------------------------------------
// Mensagem cordial
// -----------------------------------------------------------------------

test("SOFIA_MENOR_IDADE_LINES existe, é cordial e menciona 18 anos e nova inscrição futura", () => {
  const texto = SOFIA_MENOR_IDADE_LINES.join(" ")
  assert.match(texto, /18 anos/)
  assert.match(texto, /nova inscrição/i)
  assert.doesNotMatch(texto, /erro|inválid/i)
})

// -----------------------------------------------------------------------
// useSofiaFlow.ts — prova estrutural de que o encerramento acontece ANTES
// de perguntar telefone/profissão/empresa/Instagram e ANTES de qualquer
// chamada a finalize-candidate/lead/ai_analysis/CAPI.
// -----------------------------------------------------------------------

const useSofiaFlowSource = read("../apps/landing/src/hooks/useSofiaFlow.ts")

test("advanceAfterAnswer verifica isMenorDeIdade ANTES de calcular a próxima etapa (findNextStepIndex)", () => {
  const advanceBody = useSofiaFlowSource.split("const advanceAfterAnswer = useCallback(")[1]
  const posicaoCheckMenor = advanceBody.indexOf("isMenorDeIdade(")
  const posicaoFindNext = advanceBody.indexOf("findNextStepIndex(fromIndex")
  assert.ok(posicaoCheckMenor > -1, "checagem isMenorDeIdade não encontrada dentro de advanceAfterAnswer")
  assert.ok(posicaoFindNext > -1, "findNextStepIndex não encontrado dentro de advanceAfterAnswer")
  assert.ok(posicaoCheckMenor < posicaoFindNext, "a checagem de menoridade precisa vir ANTES de decidir a próxima pergunta")
})

test("handleMenorDeIdade nunca chama runSubmission/finalizeCandidate", () => {
  const bloco = useSofiaFlowSource.split("const handleMenorDeIdade = useCallback(")[1].split("const advanceAfterAnswer")[0]
  assert.doesNotMatch(bloco, /runSubmission/)
  assert.doesNotMatch(bloco, /finalizeCandidate/)
})

test("handleMenorDeIdade encerra em fase terminal (abandoned), mesmo padrão de handleAbandonment", () => {
  const bloco = useSofiaFlowSource.split("const handleMenorDeIdade = useCallback(")[1].split("const advanceAfterAnswer")[0]
  assert.match(bloco, /setPhase\("abandoned"\)/)
})
