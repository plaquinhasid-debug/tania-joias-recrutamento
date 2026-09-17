// Edge Function: get-my-embaixadora (E2.7-B/E2.7-C)
//
// Portal Mínimo da Embaixadora: devolve nome/status/codigo_referral pra
// QUALQUER usuário autenticado cujo `auth.uid()` corresponda a
// `embaixadoras.user_id`, cujo status seja `ativa`, E que NÃO seja equipe.
// SOMENTE LEITURA — nunca insere/atualiza/apaga nada.
//
// AUTORIZAÇÃO — diferente de create-ambassador-invite/list-ambassadors-admin/
// resend-ambassador-invite (que só deixam equipe passar), esta function é
// pra qualquer conta autenticada — mas nunca pra equipe. `authorize` extrai
// e valida o JWT (`auth.getUser`), devolvendo o uid real — nunca lê
// identidade de query/body.
//
// CHECAGEM AUTORITATIVA DE EQUIPE (E2.7-C) — achado da auditoria da E2.7-B:
// `user_id = auth.uid()` sozinho garante "só a própria linha", mas nunca
// garantiu "nunca equipe" (dependia de uma invariante de aplicação, não de
// constraint no banco). `checkIsEquipe` consulta `public.profiles.papel`
// DIRETO via service_role pro uid já validado — mesma fonte de verdade que
// `public.is_equipe()` (SECURITY DEFINER) consulta, mesma condição
// (`papel = 'equipe'`). Não chamamos a RPC `is_equipe()` aqui de propósito:
// ela resolve `auth.uid()` a partir do contexto JWT da requisição via
// PostgREST (por isso as outras functions montam um client extra com ANON
// key + Authorization repassado) — como já temos o uid VALIDADO e
// confirmado por `auth.getUser()` acima, uma consulta direta e explícita
// por esse uid é mais simples e igualmente autoritativa, sem precisar de
// SUPABASE_ANON_KEY nem de um segundo client nesta function.
//
// CORS — mesma allowlist de create-ambassador-invite/list-ambassadors-admin/
// resend-ambassador-invite (EMBAIXADORAS_ALLOWED_ORIGINS): esta function só
// é chamada do próprio Admin (onde vive o Portal Mínimo nesta etapa),
// nunca da Landing.
//
// service_role só existe aqui dentro (I/O real) — nunca é exposto ao
// browser. Nenhuma GRANT/RLS nova foi criada pra `authenticated` ler
// `embaixadoras` direto — o acesso continua mediado só por esta function.
import { createClient } from "npm:@supabase/supabase-js@2"

import { createGetMyEmbaixadoraHandler, type AuthorizeResult } from "./handler.ts"
import type { MinhaEmbaixadoraRow } from "./logic.ts"

function allowedOrigins(): string[] {
  return (Deno.env.get("EMBAIXADORAS_ALLOWED_ORIGINS") ?? Deno.env.get("AGENT_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
}

// `!` (non-null assertion) não valida nada em runtime — ver auditoria
// E2.2-C1.1. `requireEnv` falha alto no boot do módulo se a env var
// estiver ausente ou vazia.
function requireEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value || value.trim().length === 0) {
    throw new Error(`missing_required_env:${name}`)
  }
  return value
}

const SUPABASE_URL = requireEnv("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY")

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function authorize(authorizationHeader: string | null): Promise<AuthorizeResult> {
  if (!authorizationHeader?.startsWith("Bearer ")) return { authorized: false, status: 401 }
  const jwt = authorizationHeader.slice("Bearer ".length).trim()
  if (!jwt) return { authorized: false, status: 401 }

  const { data: userData, error: userError } = await serviceClient.auth.getUser(jwt)
  if (userError || !userData.user) return { authorized: false, status: 401 }

  return { authorized: true, uid: userData.user.id }
}

Deno.serve(
  createGetMyEmbaixadoraHandler({
    allowedOrigins: allowedOrigins(),
    authorize,
    // Ver comentário de topo (CHECAGEM AUTORITATIVA DE EQUIPE). Mesma
    // condição de public.is_equipe(): `papel = 'equipe'`. `.maybeSingle()`
    // -> `data` é `null` se o profile não existir (nunca deveria acontecer
    // pra um uid que já passou por auth.getUser(), mas `data?.papel` trata
    // isso com segurança, sem lançar).
    checkIsEquipe: async (uid) => {
      const { data, error } = await serviceClient
        .from("profiles")
        .select("papel")
        .eq("id", uid)
        .maybeSingle()
      if (error) throw error
      return data?.papel === "equipe"
    },
    findMinhaEmbaixadora: async (uid) => {
      // SELECT explícito — nunca "*". Só os 3 campos que o Portal Mínimo
      // mostra; nunca invite_token_hash/invite_claim_*/invite_expira_em/
      // invite_token_usado_em/telefone_normalizado/email/user_id/
      // aprovada_em/aprovada_por.
      // .eq("user_id", uid): `uid` vem SÓ de `authorize` (JWT validado),
      // nunca de body/query do request — estruturalmente impossível uma
      // Embaixadora consultar o `user_id` de outra por esta function.
      const { data, error } = await serviceClient
        .from("embaixadoras")
        .select("nome, status, codigo_referral")
        .eq("user_id", uid)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as MinhaEmbaixadoraRow | null
    },
    // Log estruturado e minimizado — nunca grava nome, e-mail, telefone,
    // instagram ou codigo_referral, só o uid (identificador interno) e
    // metadados (mesmo espírito de list-ambassadors-admin/index.ts).
    logEvent: (fields) =>
      console.log(JSON.stringify({ fn: "get-my-embaixadora", ts: new Date().toISOString(), ...fields })),
  }),
)
