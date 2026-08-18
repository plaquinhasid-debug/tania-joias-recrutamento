import test from "node:test"
import assert from "node:assert/strict"
import {
  decisaoTaniaDisponivel,
  etapaAposDecisaoTania,
} from "../apps/admin/src/lib/taniaDecisionGate.ts"

// -----------------------------------------------------------------------
// IMPLEMENTATION-CRM-003A — decisão da Tania não pode depender de WhatsApp.
// Casos A-F pedidos na tarefa.
// -----------------------------------------------------------------------

// A. etapa confirmada + ficha preenchida -> decisão disponível
test("A. etapa 'confirmada' -> decisão disponível", () => {
  assert.equal(decisaoTaniaDisponivel("confirmada"), true)
})

// B. etapa aguardando_tania + ficha preenchida -> decisão disponível
test("B. etapa 'aguardando_tania' -> decisão disponível", () => {
  assert.equal(decisaoTaniaDisponivel("aguardando_tania"), true)
})

// C. decisão não depende de envio WhatsApp — a função nem recebe esse dado:
// só o parâmetro `etapa` decide, comprovando estruturalmente que nenhum sinal
// de WhatsApp (enviado/aceito/entregue) participa do gate.
test("C. gate depende só da etapa, nunca de status de entrega do WhatsApp", () => {
  assert.equal(decisaoTaniaDisponivel.length, 1)
  assert.equal(decisaoTaniaDisponivel("confirmada"), decisaoTaniaDisponivel("aguardando_tania"))
})

// D. "Enviar pra Tania" não é pré-requisito — outras etapas do funil (antes
// ou depois da decisão) continuam bloqueadas, sem depender de nenhum envio.
test("D. etapas fora do par confirmada/aguardando_tania -> decisão indisponível", () => {
  assert.equal(decisaoTaniaDisponivel("contatada"), false)
  assert.equal(decisaoTaniaDisponivel("ativa"), false)
  assert.equal(decisaoTaniaDisponivel("desistiu"), false)
  assert.equal(decisaoTaniaDisponivel(null), false)
})

// E. Tania aprovou continua gravando 'ativa'
test("E. etapaAposDecisaoTania(true) -> 'ativa'", () => {
  assert.equal(etapaAposDecisaoTania(true), "ativa")
})

// F. Tania recusou continua gravando 'desistiu'
test("F. etapaAposDecisaoTania(false) -> 'desistiu'", () => {
  assert.equal(etapaAposDecisaoTania(false), "desistiu")
})
