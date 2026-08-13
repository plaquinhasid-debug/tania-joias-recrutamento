// Edge Function: get-ficha
//
// Primeira chamada da página pública `/ficha/:token` (Landing) — devolve se
// o link é válido, já foi preenchido, ou está pendente (junto do primeiro
// nome da candidata, só pra saudação). Chamada com o papel `anon`, por isso
// usa service role pra ler `leads_ficha`/`leads` (que só têm política de
// RLS para `authenticated`, mesmo motivo documentado em `sofia-config`).
//
// O token é a ÚNICA credencial da candidata — nunca expõe o `lead_id` nem
// qualquer outro dado da lead além do primeiro nome.
import { createClient } from "npm:@supabase/supabase-js@2"

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

  let body: { token?: string }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400)
  }

  if (!body?.token) {
    return jsonResponse({ error: "missing_token" }, 400)
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  const { data: ficha, error } = await supabase
    .from("leads_ficha")
    .select("preenchido_em, leads(nome)")
    .eq("token", body.token)
    .maybeSingle()

  if (error || !ficha) {
    return jsonResponse({ status: "invalido" })
  }

  if (ficha.preenchido_em) {
    return jsonResponse({ status: "preenchida" })
  }

  const nomeCompleto = (ficha.leads as { nome?: string } | null)?.nome ?? ""
  const primeiroNome = nomeCompleto.trim().split(/\s+/)[0] ?? ""

  return jsonResponse({ status: "pendente", nome: primeiroNome })
})
