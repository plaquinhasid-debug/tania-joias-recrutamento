// Edge Function: sofia-reagir
//
// Gera, ao vivo, a reação contextual da Sofia em 2 pontos da conversa
// (depois de "profissao" e depois de "objetivo") — ver `useSofiaFlow.ts`.
// Sempre retorna 200 com `{ mensagem: string | null }`: `null` sempre que a
// flag `sofia_ia_ativa` estiver desligada, a chave não estiver configurada,
// ou a chamada à IA falhar/expirar. O front-end trata `null` caindo no texto
// estático do roteiro (`sofia-script.ts`) — nunca deve travar a conversa da
// candidata por causa disso.
import { createClient } from "npm:@supabase/supabase-js@2"

import { generateSofiaReacao, type SofiaReacaoIntent } from "../_shared/sofia-reacao.ts"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

// IMPLEMENTATION-LGPD-001A — `respostasAnteriores` removido do contrato:
// nunca era necessário para a reação de 1-3 linhas, e incluía nome/
// telefone/Instagram real no prompt enviado à Anthropic. Ver
// `_shared/sofia-reacao.ts`.
type Payload = {
  intent: SofiaReacaoIntent
  campo: string
  valor: string
  proximaPerguntaBase?: string
}

type SofiaIaAtiva = { ativa: boolean }

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

  let payload: Payload
  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400)
  }

  if (!payload?.intent || !payload?.campo || !payload?.valor) {
    return jsonResponse({ error: "missing_required_fields" }, 400)
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  const { data: settingRow } = await supabase
    .from("settings")
    .select("valor")
    .eq("chave", "sofia_ia_ativa")
    .maybeSingle()

  const sofiaIaAtiva = Boolean((settingRow?.valor as SofiaIaAtiva | undefined)?.ativa)
  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY")

  if (!sofiaIaAtiva || !anthropicApiKey) {
    return jsonResponse({ mensagem: null })
  }

  try {
    const mensagem = await generateSofiaReacao({
      apiKey: anthropicApiKey,
      intent: payload.intent,
      campo: payload.campo,
      valor: payload.valor,
      proximaPerguntaBase: payload.proximaPerguntaBase,
    })
    return jsonResponse({ mensagem })
  } catch (err) {
    console.error("[sofia-reagir] falha ao gerar reação, front-end cai no texto estático", err)
    return jsonResponse({ mensagem: null })
  }
})
