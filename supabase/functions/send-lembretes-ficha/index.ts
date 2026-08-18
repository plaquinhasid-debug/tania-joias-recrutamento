// Edge Function: send-lembretes-ficha
//
// Chamada 1x por dia via pg_cron (job `lembrete-ficha-pendente`, ver
// migration 20260815010000). Varre `leads_ficha` procurando quem está há
// mais de 2 dias com o link gerado e não preenchido, e manda o lembrete
// sozinha — reaproveitando o mesmo template `ficha_aprovacao_link` e o
// mesmo helper já usados no envio original (`finalize-candidate` /
// `send-whatsapp-ficha`), só disparado pelo tempo em vez de por um evento.
//
// Best-effort e idempotente: cada lead só recebe o lembrete 1x
// (`leads_ficha.lembrete_enviado_em`). Se a flag
// `whatsapp_lembrete_ficha_automatico_ativa` estiver desligada (default),
// não faz nada. Uma falha de envio numa lead não impede as outras.
import { createClient } from "npm:@supabase/supabase-js@2"

import { sendWhatsappFichaTemplate } from "../_shared/whatsapp-cloud-api.ts"
import { recordOutboundWhatsappMessage } from "../_shared/whatsapp-message-log.ts"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

type WhatsappLembreteFichaAutomaticoAtiva = { ativa: boolean }

const DIAS_PARA_LEMBRAR = 2

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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  const { data: settingsRow } = await supabase
    .from("settings")
    .select("valor")
    .eq("chave", "whatsapp_lembrete_ficha_automatico_ativa")
    .maybeSingle()

  const flagAtiva = Boolean(
    (settingsRow?.valor as WhatsappLembreteFichaAutomaticoAtiva | undefined)?.ativa,
  )
  if (!flagAtiva) {
    return jsonResponse({ skipped: true, reason: "flag_off" })
  }

  const limiar = new Date(Date.now() - DIAS_PARA_LEMBRAR * 24 * 60 * 60 * 1000).toISOString()

  const { data: pendentes, error: pendentesError } = await supabase
    .from("leads_ficha")
    .select("lead_id, token, criado_em, leads(nome, telefone, whatsapp)")
    .is("preenchido_em", null)
    .is("lembrete_enviado_em", null)
    .lt("criado_em", limiar)

  if (pendentesError) {
    return jsonResponse({ error: "query_failed", detail: pendentesError.message }, 500)
  }

  const token = Deno.env.get("WHATSAPP_CLOUD_API_TOKEN")
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")
  const templateName = Deno.env.get("WHATSAPP_FICHA_TEMPLATE_NAME")
  if (!token || !phoneNumberId || !templateName) {
    return jsonResponse({ error: "whatsapp_credentials_not_configured" }, 500)
  }

  let enviados = 0
  let ignorados = 0
  const erros: string[] = []
  const respostas: unknown[] = []

  for (const ficha of pendentes ?? []) {
    const lead = ficha.leads as unknown as
      | { nome: string; telefone: string; whatsapp: boolean | null }
      | null
    if (!lead || lead.whatsapp !== true) {
      ignorados += 1
      continue
    }

    try {
      const resposta = await sendWhatsappFichaTemplate({
        token,
        phoneNumberId,
        templateName,
        telefone: lead.telefone,
        nome: lead.nome,
        fichaToken: ficha.token,
      })
      respostas.push(resposta)
      await supabase
        .from("leads_ficha")
        .update({ lembrete_enviado_em: new Date().toISOString() })
        .eq("lead_id", ficha.lead_id)
      // IMPLEMENTATION-015B — mesmo registro do wamid dos outros dois
      // caminhos, pro webhook poder rastrear status de entrega também nos
      // lembretes.
      await recordOutboundWhatsappMessage({
        supabase,
        telefone: lead.telefone,
        templateName,
        leadId: ficha.lead_id,
        graphApiResponse: resposta,
      })
      enviados += 1
    } catch (err) {
      erros.push(`${ficha.lead_id}: ${String(err)}`)
    }
  }

  return jsonResponse({ enviados, ignorados, erros, respostas })
})
