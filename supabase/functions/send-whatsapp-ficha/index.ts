// Edge Function: send-whatsapp-ficha
//
// Chamada pelo painel Admin assim que o link da Ficha de Aprovação é gerado
// (`useLeadDetail.ts`, aprovação manual). A aprovação automática pela IPR
// (`finalize-candidate`) chama o helper compartilhado direto, sem passar por
// aqui — mesma divisão já usada pra `send-whatsapp-approval`.
//
// Best-effort e idempotente: se `leads_ficha.whatsapp_enviado_em` já estiver
// preenchido, não reenvia. Se a flag `whatsapp_ficha_automatica_ativa`
// estiver desligada (default), não envia nada.
import { createClient } from "npm:@supabase/supabase-js@2"

import { sendWhatsappFichaTemplate } from "../_shared/whatsapp-cloud-api.ts"
import { recordOutboundWhatsappMessage } from "../_shared/whatsapp-message-log.ts"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

type WhatsappFichaAutomaticaAtiva = { ativa: boolean }

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS })
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405)
  }

  let body: { lead_id?: string }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400)
  }

  if (!body?.lead_id) {
    return jsonResponse({ error: "missing_lead_id" }, 400)
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  const { data: settingsRow } = await supabase
    .from("settings")
    .select("valor")
    .eq("chave", "whatsapp_ficha_automatica_ativa")
    .maybeSingle()

  const flagAtiva = Boolean(
    (settingsRow?.valor as WhatsappFichaAutomaticaAtiva | undefined)?.ativa,
  )
  if (!flagAtiva) {
    return jsonResponse({ skipped: true, reason: "flag_off" })
  }

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, nome, telefone, whatsapp")
    .eq("id", body.lead_id)
    .single()

  if (leadError || !lead) {
    return jsonResponse({ error: "lead_not_found" }, 404)
  }

  if (lead.whatsapp !== true) {
    return jsonResponse({ skipped: true, reason: "no_whatsapp" })
  }

  const { data: ficha, error: fichaError } = await supabase
    .from("leads_ficha")
    .select("token, whatsapp_enviado_em")
    .eq("lead_id", body.lead_id)
    .maybeSingle()

  if (fichaError || !ficha) {
    return jsonResponse({ error: "ficha_not_found" }, 404)
  }

  if (ficha.whatsapp_enviado_em) {
    return jsonResponse({ skipped: true, reason: "already_sent" })
  }

  const token = Deno.env.get("WHATSAPP_CLOUD_API_TOKEN")
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")
  const templateName = Deno.env.get("WHATSAPP_FICHA_TEMPLATE_NAME")
  if (!token || !phoneNumberId || !templateName) {
    return jsonResponse({ error: "whatsapp_credentials_not_configured" }, 500)
  }

  let graphApiResponse: unknown
  try {
    graphApiResponse = await sendWhatsappFichaTemplate({
      token,
      phoneNumberId,
      templateName,
      telefone: lead.telefone,
      nome: lead.nome,
      fichaToken: ficha.token,
    })
  } catch (err) {
    return jsonResponse({ error: "whatsapp_send_failed", detail: String(err) }, 502)
  }

  await supabase
    .from("leads_ficha")
    .update({ whatsapp_enviado_em: new Date().toISOString() })
    .eq("lead_id", body.lead_id)

  // IMPLEMENTATION-015B — mesmo registro do wamid do caminho automático
  // (ver finalize-candidate), pro webhook poder rastrear status de entrega
  // também nos envios manuais feitos pelo Admin.
  await recordOutboundWhatsappMessage({
    supabase,
    telefone: lead.telefone,
    templateName,
    leadId: lead.id,
    graphApiResponse,
  })

  return jsonResponse({ sent: true })
})
