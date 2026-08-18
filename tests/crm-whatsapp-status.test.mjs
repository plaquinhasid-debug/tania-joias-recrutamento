import test from "node:test"
import assert from "node:assert/strict"
import {
  deriveWhatsappDeliveryStatus,
  pickMostRecentWhatsappMessage,
} from "../apps/admin/src/lib/whatsappStatus.ts"

// -----------------------------------------------------------------------
// IMPLEMENTATION-CRM-002A — status real de entrega exibido no Admin,
// nunca inventado. Casos C-H pedidos na tarefa.
// -----------------------------------------------------------------------

function msg(overrides = {}) {
  return {
    meta_message_id: "wamid.X",
    message_type: "template",
    sent_at: null,
    delivered_at: null,
    read_at: null,
    failed_at: null,
    error_code: null,
    error_title: null,
    created_at: "2026-08-18T00:00:00Z",
    ...overrides,
  }
}

// C. ficha sem qualquer envio -> Sem confirmação de contato
test("C. sem whatsapp_enviado_em e sem whatsapp_messages -> no_confirmation", () => {
  const status = deriveWhatsappDeliveryStatus({ whatsappEnviadoEm: null, messages: [] })
  assert.equal(status.kind, "no_confirmation")
})

// D. whatsapp_enviado_em antigo (sem linha em whatsapp_messages, anterior à 015B) -> accepted
test("D. whatsapp_enviado_em preenchido, nenhuma mensagem correlacionada -> accepted", () => {
  const status = deriveWhatsappDeliveryStatus({
    whatsappEnviadoEm: "2026-08-16T12:03:43Z",
    messages: [],
  })
  assert.equal(status.kind, "accepted")
})

// E. sent_at -> Enviada
test("E. mensagem com sent_at só -> sent", () => {
  const status = deriveWhatsappDeliveryStatus({
    whatsappEnviadoEm: "2026-08-18T00:00:00Z",
    messages: [msg({ sent_at: "2026-08-18T00:00:05Z" })],
  })
  assert.equal(status.kind, "sent")
})

// F. delivered_at -> Entregue
test("F. mensagem com delivered_at -> delivered", () => {
  const status = deriveWhatsappDeliveryStatus({
    whatsappEnviadoEm: "2026-08-18T00:00:00Z",
    messages: [msg({ sent_at: "2026-08-18T00:00:05Z", delivered_at: "2026-08-18T00:00:10Z" })],
  })
  assert.equal(status.kind, "delivered")
})

// G. read_at -> Lida
test("G. mensagem com read_at -> read (prioridade máxima)", () => {
  const status = deriveWhatsappDeliveryStatus({
    whatsappEnviadoEm: "2026-08-18T00:00:00Z",
    messages: [
      msg({
        sent_at: "2026-08-18T00:00:05Z",
        delivered_at: "2026-08-18T00:00:10Z",
        read_at: "2026-08-18T00:00:20Z",
      }),
    ],
  })
  assert.equal(status.kind, "read")
})

// H. failed_at -> Falhou + error_code
test("H. mensagem com failed_at -> failed, preserva error_code/error_title", () => {
  const status = deriveWhatsappDeliveryStatus({
    whatsappEnviadoEm: "2026-08-18T15:42:26Z",
    messages: [
      msg({
        failed_at: "2026-08-18T15:42:33Z",
        error_code: "131049",
        error_title: "This message was not delivered to maintain healthy ecosystem engagement.",
      }),
    ],
  })
  assert.equal(status.kind, "failed")
  assert.equal(status.errorCode, "131049")
  assert.match(status.errorTitle, /healthy ecosystem/)
})

// Correlação segura com múltiplas mensagens (envio original + lembrete)

test("múltiplas mensagens: usa a mais recente (created_at maior), ignora falha antiga já superada por reenvio", () => {
  const status = deriveWhatsappDeliveryStatus({
    whatsappEnviadoEm: "2026-08-15T10:00:00Z",
    messages: [
      msg({ created_at: "2026-08-15T10:00:00Z", failed_at: "2026-08-15T10:00:05Z", error_code: "131049" }),
      msg({ created_at: "2026-08-17T10:00:00Z", sent_at: "2026-08-17T10:00:05Z" }),
    ],
  })
  assert.equal(status.kind, "sent")
})

test("pickMostRecentWhatsappMessage: ignora mensagens que não são do template da Ficha (message_type != template)", () => {
  const picked = pickMostRecentWhatsappMessage([
    { meta_message_id: "a", message_type: "text", created_at: "2026-08-18T12:00:00Z" },
    { meta_message_id: "b", message_type: "template", created_at: "2026-08-17T12:00:00Z" },
  ])
  assert.equal(picked.meta_message_id, "b")
})

test("pickMostRecentWhatsappMessage: lista vazia/undefined -> null, nunca lança", () => {
  assert.equal(pickMostRecentWhatsappMessage([]), null)
  assert.equal(pickMostRecentWhatsappMessage(undefined), null)
  assert.equal(pickMostRecentWhatsappMessage(null), null)
})

// Nunca inventa: accepted só quando whatsapp_enviado_em existe de verdade

test("nunca promove 'no_confirmation' para 'accepted' sem whatsapp_enviado_em real", () => {
  const status = deriveWhatsappDeliveryStatus({ whatsappEnviadoEm: null, messages: [] })
  assert.notEqual(status.kind, "accepted")
})
