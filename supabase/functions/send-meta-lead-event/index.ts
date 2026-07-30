// Edge Function: send-meta-lead-event
//
// Chamada pelo painel Admin sempre que uma lead muda de status para
// "aprovada" (seja pelo botão "Aprovar" ou arrastando no Kanban). Cobre o
// caso que `finalize-candidate` não cobre: leads que caíram em "análise
// manual" e só foram aprovadas depois, pela equipe — o Pixel do navegador já
// não está mais ali pra avisar o Meta, então o aviso precisa vir do servidor.
//
// Idempotente: se `meta_lead_sent_at` já estiver preenchido, não reenvia.
import { createClient } from "npm:@supabase/supabase-js@2"

import { sendMetaLeadEvent } from "../_shared/meta-conversions.ts"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

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

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, telefone, status, fbp, fbc, client_ip, client_user_agent, meta_lead_sent_at")
    .eq("id", body.lead_id)
    .single()

  if (leadError || !lead) {
    return jsonResponse({ error: "lead_not_found" }, 404)
  }

  if (lead.status !== "aprovada") {
    return jsonResponse({ error: "lead_not_approved", skipped: true }, 400)
  }

  if (lead.meta_lead_sent_at) {
    return jsonResponse({ skipped: true, reason: "already_sent" })
  }

  const pixelId = Deno.env.get("META_PIXEL_ID")
  const accessToken = Deno.env.get("META_CONVERSIONS_API_TOKEN")
  if (!pixelId || !accessToken) {
    return jsonResponse({ error: "meta_credentials_not_configured" }, 500)
  }

  try {
    await sendMetaLeadEvent({
      pixelId,
      accessToken,
      leadId: lead.id,
      telefone: lead.telefone,
      fbp: lead.fbp,
      fbc: lead.fbc,
      clientIp: lead.client_ip,
      userAgent: lead.client_user_agent,
    })
  } catch (err) {
    return jsonResponse({ error: "meta_send_failed", detail: String(err) }, 502)
  }

  await supabase
    .from("leads")
    .update({ meta_lead_sent_at: new Date().toISOString() })
    .eq("id", lead.id)

  return jsonResponse({ sent: true })
})
