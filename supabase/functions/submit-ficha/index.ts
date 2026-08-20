// Edge Function: submit-ficha
//
// Grava a Ficha de Aprovação preenchida pela candidata via `/ficha/:token`
// (Landing). Mesmo motivo de service role que `get-ficha` — `leads_ficha` só
// tem política de RLS pra `authenticated`.
//
// Validação replicada manualmente de `fichaAprovacaoSchema`
// (`packages/shared/src/schemas.ts`) — Edge Functions (Deno) não importam
// `@tania-joias/shared`, mesma convenção do resto do projeto (ver
// `sofia-config`/`sofiaConfigResponseSchema`). Mudanças nos campos aceitos
// precisam ser replicadas nos dois lados.
//
// Uso único: se o token já tiver `preenchido_em`, a submissão é rejeitada —
// ninguém pode reenviar ou sobrescrever uma ficha já enviada.
import { createClient } from "npm:@supabase/supabase-js@2"

import { sendWhatsappTaniaNotificationTemplate } from "../_shared/whatsapp-cloud-api.ts"
import { recordOutboundWhatsappMessage } from "../_shared/whatsapp-message-log.ts"
import { getTaniaWhatsappNumero } from "../_shared/tania-whatsapp-numero.ts"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const REQUIRED_STRING_FIELDS = [
  "endereco_rua",
  "endereco_numero",
  "endereco_bairro",
  "endereco_cidade",
  "endereco_cep",
  "nome_pai",
  "nome_mae",
  "ref1_nome",
  "ref1_telefone",
  "ref2_nome",
  "ref2_telefone",
  "ref3_nome",
  "ref3_telefone",
  "ref_comercial_o_que_vende",
  "ref_comercial_nome",
  "ref_comercial_telefone",
] as const

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

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400)
  }

  const token = body.token
  if (typeof token !== "string" || !token) {
    return jsonResponse({ error: "missing_token" }, 400)
  }

  for (const field of REQUIRED_STRING_FIELDS) {
    if (typeof body[field] !== "string" || !(body[field] as string).trim()) {
      return jsonResponse({ error: "invalid_payload", field }, 400)
    }
  }

  const trabalhaAtualmente = body.trabalha_atualmente
  if (typeof trabalhaAtualmente !== "boolean") {
    return jsonResponse({ error: "invalid_payload", field: "trabalha_atualmente" }, 400)
  }
  if (trabalhaAtualmente) {
    if (typeof body.trabalho_endereco !== "string" || !body.trabalho_endereco.trim()) {
      return jsonResponse({ error: "invalid_payload", field: "trabalho_endereco" }, 400)
    }
    if (typeof body.trabalho_telefone !== "string" || !body.trabalho_telefone.trim()) {
      return jsonResponse({ error: "invalid_payload", field: "trabalho_telefone" }, 400)
    }
  }

  const temConjuge = body.tem_conjuge
  if (typeof temConjuge !== "boolean") {
    return jsonResponse({ error: "invalid_payload", field: "tem_conjuge" }, 400)
  }
  let conjugeTrabalha = false
  if (temConjuge) {
    if (typeof body.conjuge_nome !== "string" || !body.conjuge_nome.trim()) {
      return jsonResponse({ error: "invalid_payload", field: "conjuge_nome" }, 400)
    }
    if (typeof body.conjuge_telefone !== "string" || !body.conjuge_telefone.trim()) {
      return jsonResponse({ error: "invalid_payload", field: "conjuge_telefone" }, 400)
    }
    if (typeof body.conjuge_trabalha !== "boolean") {
      return jsonResponse({ error: "invalid_payload", field: "conjuge_trabalha" }, 400)
    }
    conjugeTrabalha = body.conjuge_trabalha
    if (conjugeTrabalha) {
      if (typeof body.conjuge_trabalho_local !== "string" || !body.conjuge_trabalho_local.trim()) {
        return jsonResponse({ error: "invalid_payload", field: "conjuge_trabalho_local" }, 400)
      }
      if (
        typeof body.conjuge_trabalho_telefone !== "string" ||
        !body.conjuge_trabalho_telefone.trim()
      ) {
        return jsonResponse({ error: "invalid_payload", field: "conjuge_trabalho_telefone" }, 400)
      }
    }
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  const { data: ficha } = await supabase
    .from("leads_ficha")
    .select("id, lead_id, preenchido_em")
    .eq("token", token)
    .maybeSingle()

  if (!ficha) {
    return jsonResponse({ error: "invalid_token" }, 404)
  }
  if (ficha.preenchido_em) {
    return jsonResponse({ error: "already_submitted" }, 409)
  }

  const patch: Record<string, unknown> = {
    endereco_rua: body.endereco_rua,
    endereco_numero: body.endereco_numero,
    endereco_bairro: body.endereco_bairro,
    endereco_cidade: body.endereco_cidade,
    endereco_cep: body.endereco_cep,
    nome_pai: body.nome_pai,
    nome_mae: body.nome_mae,
    trabalha_atualmente: trabalhaAtualmente,
    trabalho_endereco: trabalhaAtualmente ? body.trabalho_endereco : null,
    trabalho_telefone: trabalhaAtualmente ? body.trabalho_telefone : null,
    tem_conjuge: temConjuge,
    conjuge_nome: temConjuge ? body.conjuge_nome : null,
    conjuge_telefone: temConjuge ? body.conjuge_telefone : null,
    conjuge_trabalha: temConjuge ? conjugeTrabalha : null,
    conjuge_trabalho_local: temConjuge && conjugeTrabalha ? body.conjuge_trabalho_local : null,
    conjuge_trabalho_telefone: temConjuge && conjugeTrabalha ? body.conjuge_trabalho_telefone : null,
    ref1_nome: body.ref1_nome,
    ref1_telefone: body.ref1_telefone,
    ref2_nome: body.ref2_nome,
    ref2_telefone: body.ref2_telefone,
    ref3_nome: body.ref3_nome,
    ref3_telefone: body.ref3_telefone,
    ref_comercial_o_que_vende: body.ref_comercial_o_que_vende,
    ref_comercial_nome: body.ref_comercial_nome,
    ref_comercial_telefone: body.ref_comercial_telefone,
    preenchido_em: new Date().toISOString(),
  }

  const { error: updateError } = await supabase.from("leads_ficha").update(patch).eq("id", ficha.id)

  if (updateError) {
    console.error("[submit-ficha] falha ao gravar", updateError)
    return jsonResponse({ error: "internal_error" }, 500)
  }

  // Avança o card pra "Confirmada" no Kanban sozinho — só quando ele ainda
  // estava em "Ficha enviada" (`.eq(..., "contatada")` evita empurrar pra
  // trás uma lead que já avançou mais, ex.: se o link fosse gerado de novo).
  // Best-effort: a ficha já foi gravada com sucesso, então uma falha aqui
  // não deve impedir a candidata de ver a confirmação de envio.
  const { error: stageError } = await supabase
    .from("leads")
    .update({ etapa_pos_aprovacao: "confirmada" })
    .eq("id", ficha.lead_id)
    .eq("etapa_pos_aprovacao", "contatada")

  if (stageError) {
    console.error("[submit-ficha] falha ao avançar etapa no Kanban", stageError)
  }

  // Notifica a Tania automaticamente pelo WhatsApp oficial, se a flag
  // estiver ligada. Best-effort e degrada com segurança: se o envio falhar,
  // a lead fica em "Confirmada" e o botão manual "Enviar pra Tania" no
  // Admin continua disponível.
  //
  // IMPLEMENTATION-CRM-004C — troca do texto livre (sendWhatsappFreeText,
  // limitado à janela de 24h de atendimento) pelo template Utility
  // `nova_ficha_tania_utility` (estrutura confirmada no Meta em 20/08/2026),
  // que funciona a qualquer hora. Ver `sendWhatsappTaniaNotificationTemplate`
  // em `_shared/whatsapp-cloud-api.ts` pro payload exato.
  try {
    const { data: settingsRow } = await supabase
      .from("settings")
      .select("valor")
      .eq("chave", "whatsapp_notificacao_tania_ativa")
      .maybeSingle()
    const flagAtiva = Boolean((settingsRow?.valor as { ativa?: boolean } | undefined)?.ativa)

    const whatsappToken = Deno.env.get("WHATSAPP_CLOUD_API_TOKEN")
    const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")
    const templateName = Deno.env.get("WHATSAPP_TANIA_NOTIFICATION_TEMPLATE_NAME")
    // IMPLEMENTATION-CRM-004B — número vem de `settings.tania_whatsapp_numero`
    // (fallback: env var), nunca mais hardcoded. Ver `_shared/tania-whatsapp-numero.ts`.
    const taniaTelefone = flagAtiva && whatsappToken && phoneNumberId && templateName
      ? await getTaniaWhatsappNumero(supabase)
      : null

    if (flagAtiva && whatsappToken && phoneNumberId && templateName && taniaTelefone) {
      const { data: lead } = await supabase
        .from("leads")
        .select("id, nome, cidade")
        .eq("id", ficha.lead_id)
        .single()

      if (lead) {
        const graphApiResponse = await sendWhatsappTaniaNotificationTemplate({
          token: whatsappToken,
          phoneNumberId,
          templateName,
          telefone: taniaTelefone,
          nome: lead.nome,
          // Corpo do template não tolera variável vazia — cidade é obrigatória
          // no wizard da Sofia (min. 2 caracteres), mas o schema de `leads`
          // ainda permite NULL, daí o fallback defensivo.
          cidade: lead.cidade?.trim() || "Não informada",
          leadId: lead.id,
        })

        // IMPLEMENTATION-015B — mesmo registro do wamid dos outros 3 envios
        // de template (Ficha/lembrete/aprovação), pro webhook poder
        // rastrear status de entrega também da notificação da Tania.
        await recordOutboundWhatsappMessage({
          supabase,
          telefone: taniaTelefone,
          templateName,
          leadId: lead.id,
          graphApiResponse,
          messagePurpose: "NOTIFICACAO_TANIA",
        })

        // Só avança pra "Aguardando aprovação da Tania" se a mensagem saiu —
        // assim o botão manual "Enviar pra Tania" some do Admin exatamente
        // quando ele deixa de ser necessário.
        await supabase
          .from("leads")
          .update({ etapa_pos_aprovacao: "aguardando_tania" })
          .eq("id", lead.id)
          .eq("etapa_pos_aprovacao", "confirmada")
      }
    }
  } catch (notifyError) {
    console.error("[submit-ficha] falha ao notificar Tania por WhatsApp", notifyError)
  }

  return jsonResponse({ ok: true })
})
