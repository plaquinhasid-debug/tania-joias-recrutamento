// Edge Function: send-whatsapp-approval
//
// Chamada em dois pontos: por `finalize-candidate` (aprovação automática
// pela IPR) e pelo painel Admin sempre que uma lead muda de status para
// "aprovada" manualmente (`useLeadDetail.ts`, mesmo bloco que já chama
// `send-meta-lead-event`).
//
// Best-effort e idempotente: se `whatsapp_automatico_enviado_em` já estiver
// preenchido, não reenvia. Se a flag `whatsapp_aprovacao_automatica_ativa`
// estiver desligada (default), não envia nada — mesma disciplina "default
// off, a equipe liga só depois de testar" do resto do projeto.
import { createClient } from "npm:@supabase/supabase-js@2"

import { sendWhatsappApprovalTemplate } from "../_shared/whatsapp-cloud-api.ts"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

type WhatsappAprovacaoAutomaticaAtiva = { ativa: boolean }

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
    .eq("chave", "whatsapp_aprovacao_automatica_ativa")
    .maybeSingle()

  const flagAtiva = Boolean(
    (settingsRow?.valor as WhatsappAprovacaoAutomaticaAtiva | undefined)?.ativa,
  )
  if (!flagAtiva) {
    return jsonResponse({ skipped: true, reason: "flag_off" })
  }

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, nome, telefone, status, whatsapp, whatsapp_automatico_enviado_em")
    .eq("id", body.lead_id)
    .single()

  if (leadError || !lead) {
    return jsonResponse({ error: "lead_not_found" }, 404)
  }

  if (lead.status !== "aprovada") {
    return jsonResponse({ error: "lead_not_approved", skipped: true }, 400)
  }

  if (lead.whatsapp !== true) {
    return jsonResponse({ skipped: true, reason: "no_whatsapp" })
  }

  if (lead.whatsapp_automatico_enviado_em) {
    return jsonResponse({ skipped: true, reason: "already_sent" })
  }

  const token = Deno.env.get("WHATSAPP_CLOUD_API_TOKEN")
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")
  const templateName = Deno.env.get("WHATSAPP_APPROVAL_TEMPLATE_NAME")
  if (!token || !phoneNumberId || !templateName) {
    return jsonResponse({ error: "whatsapp_credentials_not_configured" }, 500)
  }

  try {
    await sendWhatsappApprovalTemplate({
      token,
      phoneNumberId,
      templateName,
      telefone: lead.telefone,
      nome: lead.nome,
    })
  } catch (err) {
    return jsonResponse({ error: "whatsapp_send_failed", detail: String(err) }, 502)
  }

  await supabase
    .from("leads")
    .update({ whatsapp_automatico_enviado_em: new Date().toISOString() })
    .eq("id", lead.id)

  return jsonResponse({ sent: true })
})
