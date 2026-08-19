// _shared/whatsapp-message-log.ts (IMPLEMENTATION-INTELLIGENCE-015B)
//
// A 015A comprovou que `whatsapp_enviado_em` (em `leads_ficha`/`leads`)
// significa só "a Meta aceitou a requisição" — nunca "entregue ao celular".
// Este arquivo é o lado do ENVIO dessa correção: assim que a Graph API
// aceita um template outbound, registra o wamid retornado em
// `whatsapp_messages` (mesma tabela já usada pelo webhook inbound), pra que
// o webhook consiga depois correlacionar os eventos `sent`/`delivered`/
// `read`/`failed` a este envio específico (ver `apps/admin/api/webhooks/
// whatsapp.mjs`, `applyStatusUpdate`).
//
// Nunca lança — é só observabilidade. Uma falha aqui não pode derrubar um
// envio que já aconteceu de verdade (a mensagem já foi aceita pela Meta
// antes deste código rodar).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2"

/**
 * Extrai o wamid (`messages[0].id`) da resposta bruta da Graph API.
 * Formato esperado por contrato da Meta: string começando com "wamid.".
 * Devolve `null` (nunca lança) se o formato não bater — chamador decide o
 * que fazer (aqui, só loga e segue sem rastrear este envio).
 */
export function extractWamid(graphApiResponse: unknown): string | null {
  if (typeof graphApiResponse !== "object" || graphApiResponse === null) return null
  const messages = (graphApiResponse as { messages?: unknown }).messages
  if (!Array.isArray(messages) || messages.length === 0) return null
  const id = (messages[0] as { id?: unknown })?.id
  if (typeof id !== "string" || !id.startsWith("wamid.")) return null
  return id
}

// IMPLEMENTATION-CRM-004B — classificação explícita do MOTIVO do envio,
// independente do template usado (dois propósitos diferentes podem usar o
// mesmo template, ex.: FICHA_CANDIDATA e LEMBRETE_FICHA ambos usam
// "ficha_aprovacao_link"). Necessário pra `deriveWhatsappDeliveryStatus`
// (Admin) conseguir isolar o status da Ficha do status de uma futura
// notificação da Tania, em vez de misturar "a mensagem mais recente
// qualquer" pro mesmo lead_id. Ver migration
// `20260818180000_add_whatsapp_messages_purpose.sql`.
export type WhatsappMessagePurpose =
  | "FICHA_CANDIDATA"
  | "LEMBRETE_FICHA"
  | "NOTIFICACAO_TANIA"
  | "TEXTO_LIVRE"
  | "INBOUND"

export interface RecordOutboundWhatsappMessageParams {
  supabase: SupabaseClient
  telefone: string
  /** Nome do template enviado (ex.: "ficha_aprovacao_link") — vira o `body`, só como referência, nunca o conteúdo completo da mensagem. */
  templateName: string
  /** Lead que originou o envio, quando aplicável. */
  leadId?: string | null
  /** Retorno bruto (`await response.json()`) de `sendWhatsappFichaTemplate`/`sendWhatsappApprovalTemplate`. */
  graphApiResponse: unknown
  /** Motivo do envio — obrigatório, nunca inferido do nome do template. */
  messagePurpose: WhatsappMessagePurpose
}

/**
 * Registra a mensagem outbound recém-aceita. `whatsapp_messages.telefone`
 * tem FK pra `whatsapp_contacts` — candidatas que nunca mandaram mensagem
 * pra nós ainda não têm contato salvo, então faz upsert primeiro (mesmo
 * padrão do webhook inbound, `saveInboundMessage`). `status: "accepted"`
 * aqui é deliberado — nunca "sent"/"delivered": essas três vêm só do
 * webhook de status, nunca são presumidas no momento do envio.
 */
export async function recordOutboundWhatsappMessage({
  supabase,
  telefone,
  templateName,
  leadId,
  graphApiResponse,
  messagePurpose,
}: RecordOutboundWhatsappMessageParams): Promise<void> {
  const wamid = extractWamid(graphApiResponse)
  if (!wamid) {
    console.error(
      "[whatsapp-message-log] resposta da Graph API sem wamid reconhecível — status de entrega não poderá ser rastreado para este envio",
    )
    return
  }

  try {
    const now = new Date().toISOString()
    await supabase
      .from("whatsapp_contacts")
      .upsert({ telefone, last_message_at: now, updated_at: now }, { onConflict: "telefone" })

    await supabase.from("whatsapp_messages").insert({
      meta_message_id: wamid,
      telefone,
      direction: "outbound",
      message_type: "template",
      body: templateName,
      status: "accepted",
      lead_id: leadId ?? null,
      message_purpose: messagePurpose,
    })
  } catch (err) {
    console.error(
      "[whatsapp-message-log] falha ao registrar mensagem outbound (não afeta o envio já realizado)",
      err,
    )
  }
}
