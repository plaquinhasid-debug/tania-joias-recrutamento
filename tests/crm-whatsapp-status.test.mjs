import test from "node:test"
import assert from "node:assert/strict"
import {
  deriveTaniaNotificationStatus,
  deriveWhatsappDeliveryStatus,
  pickMostRecentTaniaNotification,
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
    message_purpose: null,
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

// -----------------------------------------------------------------------
// IMPLEMENTATION-CRM-004B (item F/20) — separação de propósito: o badge da
// Ficha nunca pode considerar uma mensagem NOTIFICACAO_TANIA (e vice-versa),
// mesmo quando ambas têm o mesmo lead_id e chegam na mesma lista.
// -----------------------------------------------------------------------

test("badge da Ficha ignora mensagens NOTIFICACAO_TANIA mesmo sendo mais recentes", () => {
  const mensagens = [
    msg({
      meta_message_id: "ficha",
      message_purpose: "FICHA_CANDIDATA",
      created_at: "2026-08-18T10:00:00Z",
      delivered_at: "2026-08-18T10:00:05Z",
    }),
    msg({
      meta_message_id: "tania",
      message_purpose: "NOTIFICACAO_TANIA",
      created_at: "2026-08-18T12:00:00Z",
      read_at: "2026-08-18T12:00:10Z",
    }),
  ]
  const picked = pickMostRecentWhatsappMessage(mensagens)
  assert.equal(picked.meta_message_id, "ficha")

  const status = deriveWhatsappDeliveryStatus({ whatsappEnviadoEm: "2026-08-18T10:00:00Z", messages: mensagens })
  assert.equal(status.kind, "delivered")
})

test("badge da Tania ignora mensagens FICHA_CANDIDATA/LEMBRETE_FICHA mesmo sendo mais recentes", () => {
  const mensagens = [
    msg({
      meta_message_id: "tania",
      message_purpose: "NOTIFICACAO_TANIA",
      created_at: "2026-08-18T10:00:00Z",
      sent_at: "2026-08-18T10:00:05Z",
    }),
    msg({
      meta_message_id: "lembrete",
      message_purpose: "LEMBRETE_FICHA",
      created_at: "2026-08-18T12:00:00Z",
      read_at: "2026-08-18T12:00:10Z",
    }),
  ]
  const picked = pickMostRecentTaniaNotification(mensagens)
  assert.equal(picked.meta_message_id, "tania")

  const status = deriveTaniaNotificationStatus({ taniaNotificadaEm: "2026-08-18T10:00:00Z", messages: mensagens })
  assert.equal(status.kind, "sent")
})

test("pickMostRecentWhatsappMessage trata message_purpose null como legado da Ficha (mensagens anteriores à coluna existir)", () => {
  const picked = pickMostRecentWhatsappMessage([
    msg({ meta_message_id: "legado", message_purpose: null, created_at: "2026-08-15T00:00:00Z" }),
  ])
  assert.equal(picked.meta_message_id, "legado")
})

test("pickMostRecentTaniaNotification NUNCA trata message_purpose null como notificação da Tania", () => {
  const picked = pickMostRecentTaniaNotification([
    msg({ meta_message_id: "legado", message_purpose: null, created_at: "2026-08-15T00:00:00Z" }),
  ])
  assert.equal(picked, null)
})

test("deriveTaniaNotificationStatus: nenhum envio ainda -> 'not_sent' (nunca inventa 'accepted')", () => {
  const status = deriveTaniaNotificationStatus({ taniaNotificadaEm: null, messages: [] })
  assert.equal(status.kind, "not_sent")
})

test("deriveTaniaNotificationStatus: tania_notificada_em preenchido, sem confirmação de status -> 'accepted'", () => {
  const status = deriveTaniaNotificationStatus({ taniaNotificadaEm: "2026-08-18T10:00:00Z", messages: [] })
  assert.equal(status.kind, "accepted")
})

test("deriveTaniaNotificationStatus: failed_at -> 'failed', preserva error_code", () => {
  const status = deriveTaniaNotificationStatus({
    taniaNotificadaEm: "2026-08-18T10:00:00Z",
    messages: [
      msg({
        message_purpose: "NOTIFICACAO_TANIA",
        failed_at: "2026-08-18T10:00:05Z",
        error_code: "131049",
      }),
    ],
  })
  assert.equal(status.kind, "failed")
  assert.equal(status.errorCode, "131049")
})
