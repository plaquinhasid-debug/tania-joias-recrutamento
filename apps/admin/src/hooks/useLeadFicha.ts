import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { supabase } from "@/lib/supabase"
import type { WhatsappMessageRow } from "@/lib/whatsappStatus"
import type { LeadFicha } from "@/types"

// URL pública da Landing — é lá que mora a página `/ficha/:token` que a
// candidata preenche. Preparado pra automação futura: gerar a linha é só um
// insert (RLS de `authenticated`), então tanto este botão manual quanto um
// gatilho automático na aprovação podem chamar `useGenerateFichaLink` do
// mesmo jeito.
const LANDING_URL = "https://tania-joias-landing.vercel.app"

export function fichaLinkUrl(token: string): string {
  return `${LANDING_URL}/ficha/${token}`
}

async function fetchLeadFicha(leadId: string): Promise<LeadFicha | null> {
  const { data, error } = await supabase
    .from("leads_ficha")
    .select("*")
    .eq("lead_id", leadId)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

export function useLeadFicha(leadId: string | undefined) {
  return useQuery({
    queryKey: ["lead-ficha", leadId],
    queryFn: () => fetchLeadFicha(leadId as string),
    enabled: Boolean(leadId),
  })
}

/**
 * Gera o link da Ficha (ou devolve o já existente, se por algum motivo já
 * tiver sido gerado) e avança o card pra "Contato manual / Ficha pendente"
 * no Kanban — só significa que a Ficha existe, nunca que o WhatsApp foi
 * enviado ou entregue (ver `deriveWhatsappDeliveryStatus`). Chamada tanto
 * pelo botão manual (`useGenerateFichaLink`) quanto automaticamente assim
 * que uma lead vira "aprovada" (`useLeadDetail.ts`).
 */
export async function generateFichaLink(leadId: string): Promise<LeadFicha> {
  const { data: existing } = await supabase
    .from("leads_ficha")
    .select("*")
    .eq("lead_id", leadId)
    .maybeSingle()
  if (existing) return existing

  const { data, error } = await supabase
    .from("leads_ficha")
    .insert({ lead_id: leadId })
    .select("*")
    .single()
  if (error) throw error

  // Avança o card pra "Contato manual / Ficha pendente" no Kanban sozinho —
  // só quando ela ainda estava parada em "Aprovada" (`.is(..., null)` evita
  // empurrar pra trás uma lead que já tinha avançado mais, ex.: se o link
  // for gerado de novo por engano).
  await supabase
    .from("leads")
    .update({ etapa_pos_aprovacao: "contatada" })
    .eq("id", leadId)
    .is("etapa_pos_aprovacao", null)

  return data
}

export function useGenerateFichaLink() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: generateFichaLink,
    onSuccess: (data) => {
      queryClient.setQueryData(["lead-ficha", data.lead_id], data)
      void queryClient.invalidateQueries({ queryKey: ["leads"] })
      void queryClient.invalidateQueries({ queryKey: ["lead", data.lead_id] })
    },
  })
}

/**
 * IMPLEMENTATION-CRM-002A — registra que um OPERADOR HUMANO confirmou ter
 * feito contato manual com a candidata. Só é chamada por uma ação explícita
 * no Admin (nunca como efeito colateral de abrir o WhatsApp ou copiar o
 * link) — ver `contato_manual_em` na migration
 * `20260818163000_add_leads_ficha_contato_manual.sql`.
 *
 * Idempotente por construção: o filtro `is("contato_manual_em", null)`
 * garante que uma segunda chamada nunca sobrescreve o timestamp original —
 * se a linha já tiver `contato_manual_em`, o UPDATE afeta 0 linhas e a
 * função busca e devolve o valor já existente, sem erro.
 */
export async function markManualContact(fichaId: string): Promise<LeadFicha> {
  const { data, error } = await supabase
    .from("leads_ficha")
    .update({ contato_manual_em: new Date().toISOString() })
    .eq("id", fichaId)
    .is("contato_manual_em", null)
    .select("*")
    .maybeSingle()
  if (error) throw error
  if (data) return data

  // 0 linhas afetadas = já tinha contato_manual_em preenchido; devolve o
  // valor real já gravado, sem sobrescrever.
  const { data: existing, error: fetchError } = await supabase
    .from("leads_ficha")
    .select("*")
    .eq("id", fichaId)
    .single()
  if (fetchError) throw fetchError
  return existing
}

export function useMarkManualContact() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: markManualContact,
    onSuccess: (data) => {
      queryClient.setQueryData(["lead-ficha", data.lead_id], data)
      void queryClient.invalidateQueries({ queryKey: ["leads"] })
    },
  })
}

/**
 * Mensagens de template da Ficha (envio original + lembrete) já registradas
 * pra esta lead — só o suficiente pra `deriveWhatsappDeliveryStatus` (mesma
 * função já usada em `KanbanCard.tsx`) calcular o status real de entrega
 * (`sent`/`delivered`/`read`/`failed`) depois que o botão manual envia pelo
 * caminho rastreado. Nunca filtra por `message_purpose` aqui — a própria
 * `deriveWhatsappDeliveryStatus` já isola `FICHA_CANDIDATA`/`LEMBRETE_FICHA`.
 */
async function fetchLeadFichaWhatsappMessages(leadId: string): Promise<WhatsappMessageRow[]> {
  const { data, error } = await supabase
    .from("whatsapp_messages")
    .select(
      "meta_message_id, message_type, message_purpose, sent_at, delivered_at, read_at, failed_at, error_code, error_title, created_at",
    )
    .eq("lead_id", leadId)
  if (error) throw error
  return data ?? []
}

export function useLeadFichaWhatsappMessages(leadId: string | undefined) {
  return useQuery({
    queryKey: ["lead-ficha-whatsapp-messages", leadId],
    queryFn: () => fetchLeadFichaWhatsappMessages(leadId as string),
    enabled: Boolean(leadId),
  })
}

// IMPLEMENTATION-CRM-005A — troca do botão "Mandar pelo WhatsApp" (que só
// abria `wa.me` + `window.open`, sem nenhum rastreamento) por um envio de
// verdade via `send-whatsapp-ficha`, a mesma Edge Function já usada no
// caminho automático (aprovação instantânea pela IPR / aprovação manual em
// `useLeadDetail.ts`). A Edge Function já é idempotente
// (`leads_ficha.whatsapp_enviado_em` preenchido -> `skipped/already_sent`,
// nunca reenvia) — este hook só expõe esse resultado pro componente decidir
// a mensagem certa, nunca reimplementa a checagem.
export type SendFichaWhatsappSkipReason = "flag_off" | "no_whatsapp" | "already_sent"

export interface SendFichaWhatsappResult {
  sent?: boolean
  skipped?: boolean
  reason?: SendFichaWhatsappSkipReason
}

/** Mensagem clara pro operador — `skipped` nunca é um erro técnico, é uma decisão do sistema. */
export function sendFichaWhatsappSkipMessage(reason: SendFichaWhatsappSkipReason | undefined): string {
  switch (reason) {
    case "already_sent":
      return "Essa ficha já foi enviada pelo WhatsApp."
    case "no_whatsapp":
      return "Esta candidata não tem WhatsApp confirmado."
    case "flag_off":
      return "O envio de fichas pelo WhatsApp está desativado nas configurações."
    default:
      return "O envio não foi realizado."
  }
}

type FunctionsInvoke = typeof supabase.functions.invoke

/**
 * `invoke` é injetável só pra teste (o stub de `@/lib/supabase` usado pela
 * suíte Node não simula respostas reais da Edge Function) — em produção
 * sempre usa o client real, comportamento idêntico ao de antes.
 */
export async function sendFichaWhatsapp(
  leadId: string,
  invoke: FunctionsInvoke = supabase.functions.invoke.bind(supabase.functions),
): Promise<SendFichaWhatsappResult> {
  const { data, error } = await invoke<SendFichaWhatsappResult>("send-whatsapp-ficha", {
    body: { lead_id: leadId },
  })
  if (error) throw error
  return data ?? {}
}

export function useSendFichaWhatsapp() {
  const queryClient = useQueryClient()

  return useMutation({
    // Wrapper de 1 argumento — `sendFichaWhatsapp` tem um 2º parâmetro
    // (`invoke`) só pra injeção em teste; passar a função direto faria o
    // TanStack Query encaixar seu próprio `context` de mutation nesse slot.
    mutationFn: (leadId: string) => sendFichaWhatsapp(leadId),
    onSuccess: (_data, leadId) => {
      // Recarrega a ficha (`whatsapp_enviado_em`) e as mensagens (status de
      // entrega) — mesmo em `skipped/already_sent`, isso corrige a UI se ela
      // estivesse desatualizada (ex.: outra aba já enviou antes).
      void queryClient.invalidateQueries({ queryKey: ["lead-ficha", leadId] })
      void queryClient.invalidateQueries({ queryKey: ["lead-ficha-whatsapp-messages", leadId] })
      void queryClient.invalidateQueries({ queryKey: ["leads"] })
    },
  })
}
