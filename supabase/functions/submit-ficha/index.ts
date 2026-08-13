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
    .select("id, preenchido_em")
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

  return jsonResponse({ ok: true })
})
