// IMPLEMENTATION-CRM-002A — deriva o status REAL de entrega do WhatsApp de
// uma Ficha, a partir dos dados que já existem em `whatsapp_messages`
// (IMPLEMENTATION-INTELLIGENCE-015B). Nunca trata `whatsapp_enviado_em`
// como "entregue" — esse campo só significa "a Graph API aceitou a
// requisição" (ver IMPLEMENTATION-INTELLIGENCE-015A).
//
// Correlação lead → mensagem: `whatsapp_messages.lead_id` só é preenchido
// por `recordOutboundWhatsappMessage` (`_shared/whatsapp-message-log.ts`),
// chamado exclusivamente pelos 3 caminhos de envio do template da Ficha
// (`finalize-candidate`, `send-whatsapp-ficha`, `send-lembretes-ficha`).
// O único outro caminho que grava em `whatsapp_messages`
// (`sendAutomaticReply`, resposta automática de texto a mensagem inbound,
// em `apps/admin/api/webhooks/whatsapp.mjs`) NUNCA preenche `lead_id`.
// Logo, filtrar por `lead_id` já isola só mensagens do template da Ficha —
// reforçado aqui, defensivamente, também filtrando `message_type === "template"`.

export interface WhatsappMessageRow {
  meta_message_id: string
  message_type: string | null
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
 */
export function pickMostRecentWhatsappMessage(
  messages: WhatsappMessageRow[] | null | undefined,
): WhatsappMessageRow | null {
  const templates = (messages ?? []).filter((m) => m.message_type === "template")
  if (templates.length === 0) return null
  return [...templates].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
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
