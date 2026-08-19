// IMPLEMENTATION-CRM-002A — deriva o status REAL de entrega do WhatsApp de
// uma Ficha, a partir dos dados que já existem em `whatsapp_messages`
// (IMPLEMENTATION-INTELLIGENCE-015B). Nunca trata `whatsapp_enviado_em`
// como "entregue" — esse campo só significa "a Graph API aceitou a
// requisição" (ver IMPLEMENTATION-INTELLIGENCE-015A).
//
// Correlação lead → mensagem: `whatsapp_messages.lead_id` só é preenchido
// por `recordOutboundWhatsappMessage` (`_shared/whatsapp-message-log.ts`),
// chamado exclusivamente pelos caminhos de envio de template com `lead_id`
// (Ficha: `finalize-candidate`, `send-whatsapp-ficha`, `send-lembretes-ficha`;
// futuramente também a notificação da Tania). O único outro caminho que
// grava em `whatsapp_messages` (`sendAutomaticReply`, resposta automática de
// texto a mensagem inbound, em `apps/admin/api/webhooks/whatsapp.mjs`) NUNCA
// preenche `lead_id`.
//
// IMPLEMENTATION-CRM-004B — filtrar só por `lead_id` + `message_type ===
// "template"` deixou de ser suficiente: agora dois propósitos diferentes
// (Ficha e notificação da Tania) podem ambos ter `lead_id` preenchido, e
// pegar "a mensagem de template mais recente" misturaria os dois status.
// `message_purpose` isola por propósito — `null` é tratado como legado
// (mensagens gravadas antes desta coluna existir, sempre da Ficha, nunca da
// notificação da Tania, que é sempre gravada com o campo preenchido).
export type WhatsappMessagePurpose =
  | "FICHA_CANDIDATA"
  | "LEMBRETE_FICHA"
  | "NOTIFICACAO_TANIA"
  | "TEXTO_LIVRE"
  | "INBOUND"

const FICHA_MESSAGE_PURPOSES: readonly WhatsappMessagePurpose[] = [
  "FICHA_CANDIDATA",
  "LEMBRETE_FICHA",
]

export interface WhatsappMessageRow {
  meta_message_id: string
  message_type: string | null
  message_purpose: string | null
  sent_at: string | null
  delivered_at: string | null
  read_at: string | null
  failed_at: string | null
  error_code: string | null
  error_title: string | null
  created_at: string
}

export type WhatsappDeliveryStatusKind =
  | "failed"
  | "read"
  | "delivered"
  | "sent"
  | "accepted"
  | "no_confirmation"

export interface WhatsappDeliveryStatus {
  kind: WhatsappDeliveryStatusKind
  errorCode: string | null
  errorTitle: string | null
}

export const WHATSAPP_DELIVERY_STATUS_LABEL: Record<WhatsappDeliveryStatusKind, string> = {
  failed: "Falhou no WhatsApp",
  read: "Lida",
  delivered: "Entregue",
  sent: "Enviada pela Meta",
  accepted: "Aceita pela Meta / entrega não confirmada",
  no_confirmation: "Sem confirmação de contato",
}

/**
 * Uma lead pode ter mais de uma mensagem de template da Ficha registrada
 * (envio original + lembrete). A mais recente (`created_at` maior) é a que
 * importa — reflete a tentativa mais atual, nunca uma falha antiga que já
 * foi seguida de um reenvio.
 *
 * IMPLEMENTATION-CRM-004B — só considera `message_purpose` de Ficha
 * (`FICHA_CANDIDATA`/`LEMBRETE_FICHA`) ou `null` (legado, anterior à coluna
 * existir). Nunca inclui `NOTIFICACAO_TANIA` — essa tem sua própria função,
 * `pickMostRecentTaniaNotification`, mais abaixo.
 */
export function pickMostRecentWhatsappMessage(
  messages: WhatsappMessageRow[] | null | undefined,
): WhatsappMessageRow | null {
  const templates = (messages ?? []).filter(
    (m) =>
      m.message_type === "template" &&
      (m.message_purpose == null ||
        FICHA_MESSAGE_PURPOSES.includes(m.message_purpose as WhatsappMessagePurpose)),
  )
  if (templates.length === 0) return null
  return [...templates].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
}

/**
 * Espelha `pickMostRecentWhatsappMessage`, mas isolado pra
 * `NOTIFICACAO_TANIA` — nunca cai no `null` legado (não existiam mensagens
 * desse propósito antes da coluna `message_purpose` existir). Preparado para
 * quando o template Utility da Tania for aprovado e passar a gravar aqui;
 * hoje sempre recebe lista vazia (nenhum envio desse tipo ainda existe).
 */
export function pickMostRecentTaniaNotification(
  messages: WhatsappMessageRow[] | null | undefined,
): WhatsappMessageRow | null {
  const notificacoes = (messages ?? []).filter(
    (m) => m.message_type === "template" && m.message_purpose === "NOTIFICACAO_TANIA",
  )
  if (notificacoes.length === 0) return null
  return [...notificacoes].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
}

/**
 * Prioridade: failed > read > delivered > sent > accepted (só
 * `whatsapp_enviado_em`, sem nenhuma linha em `whatsapp_messages` — envio
 * anterior à instrumentação da 015B) > sem confirmação nenhuma. Nunca
 * inventa um estágio — cada um só aparece se o dado real existir.
 */
export function deriveWhatsappDeliveryStatus(params: {
  whatsappEnviadoEm: string | null
  messages: WhatsappMessageRow[] | null | undefined
}): WhatsappDeliveryStatus {
  const mensagem = pickMostRecentWhatsappMessage(params.messages)

  if (mensagem?.failed_at) {
    return { kind: "failed", errorCode: mensagem.error_code, errorTitle: mensagem.error_title }
  }
  if (mensagem?.read_at) return { kind: "read", errorCode: null, errorTitle: null }
  if (mensagem?.delivered_at) return { kind: "delivered", errorCode: null, errorTitle: null }
  if (mensagem?.sent_at) return { kind: "sent", errorCode: null, errorTitle: null }
  if (params.whatsappEnviadoEm) return { kind: "accepted", errorCode: null, errorTitle: null }
  return { kind: "no_confirmation", errorCode: null, errorTitle: null }
}

// IMPLEMENTATION-CRM-004B (item 9) — status da notificação automática da
// Tania, mesma disciplina do status da Ficha: nunca inventa um estágio, só
// mostra o que o dado real garante. Hoje (template ainda não aprovado pela
// Meta) `messages` nunca vai ter nenhuma `NOTIFICACAO_TANIA` e
// `taniaNotificadaEm` sempre vai ser `null` — então esta função sempre
// devolve `"not_sent"` na prática, até o envio real existir.
export type TaniaNotificationStatusKind =
  | "failed"
  | "read"
  | "delivered"
  | "sent"
  | "accepted"
  | "not_sent"

export interface TaniaNotificationStatus {
  kind: TaniaNotificationStatusKind
  errorCode: string | null
  errorTitle: string | null
}

export const TANIA_NOTIFICATION_STATUS_LABEL: Record<TaniaNotificationStatusKind, string> = {
  failed: "Falhou",
  read: "Entregue",
  delivered: "Entregue",
  sent: "Enviada / sem confirmação",
  accepted: "Enviada / sem confirmação",
  not_sent: "Ainda não enviada",
}

/** Espelha `deriveWhatsappDeliveryStatus`, mas só olha `NOTIFICACAO_TANIA` (via `pickMostRecentTaniaNotification`) e `leads.tania_notificada_em`. */
export function deriveTaniaNotificationStatus(params: {
  taniaNotificadaEm: string | null
  messages: WhatsappMessageRow[] | null | undefined
}): TaniaNotificationStatus {
  const mensagem = pickMostRecentTaniaNotification(params.messages)

  if (mensagem?.failed_at) {
    return { kind: "failed", errorCode: mensagem.error_code, errorTitle: mensagem.error_title }
  }
  if (mensagem?.read_at) return { kind: "read", errorCode: null, errorTitle: null }
  if (mensagem?.delivered_at) return { kind: "delivered", errorCode: null, errorTitle: null }
  if (mensagem?.sent_at) return { kind: "sent", errorCode: null, errorTitle: null }
  if (params.taniaNotificadaEm) return { kind: "accepted", errorCode: null, errorTitle: null }
  return { kind: "not_sent", errorCode: null, errorTitle: null }
}
