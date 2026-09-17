// Edge Function: list-ambassadors-admin (E2.3-B)
//
// Segunda Edge Function administrativa das Embaixadoras: lista as linhas
// de public.embaixadoras pro Admin, chamada só por equipe autenticada.
// SOMENTE LEITURA — nunca insere/atualiza/apaga nada.
//
// AUTORIZAÇÃO — mesmo padrão de create-ambassador-invite/index.ts
// (duplicado de propósito aqui, não compartilhado — ver auditoria E2.3-A,
// seção "não abstrair prematuramente"):
//   1. extrai o JWT do header Authorization;
//   2. valida-o com supabase.auth.getUser(jwt) (client service-role,
//      passando o JWT explicitamente — isso VALIDA a assinatura);
//   3. usa um segundo client, com a ANON key + o Authorization original
//      repassado, pra chamar a RPC public.is_equipe() — assim
//      auth.uid() dentro da function SQL resolve pro usuário real da
//      requisição.
// Nunca lê papel/email/user_id de query string ou body.
//
// CORS — allowlist de origem (não "*"), mesma EMBAIXADORAS_ALLOWED_ORIGINS
// já usada por create-ambassador-invite (mesmo frontend Admin chama as
// duas functions).
//
// service_role só existe aqui dentro (I/O real) — nunca é exposto ao
// browser. authenticated não tem (e não deve ganhar) acesso direto às
// tabelas de Embaixadoras via PostgREST; esta function é o único caminho.
import { createClient } from "npm:@supabase/supabase-js@2"

import { createListAmbassadorsAdminHandler, type AuthorizeResult } from "./handler.ts"
import type { EmbaixadoraRow } from "./logic.ts"

function allowedOrigins(): string[] {
  return (Deno.env.get("EMBAIXADORAS_ALLOWED_ORIGINS") ?? Deno.env.get("AGENT_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
}

// `!` (non-null assertion) não valida nada em runtime — ver auditoria
// E2.2-C1.1. `requireEnv` falha alto no boot do módulo (antes de
// `Deno.serve`, antes de qualquer request) se a env var estiver ausente ou
// vazia.
function requireEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value || value.trim().length === 0) {
    throw new Error(`missing_required_env:${name}`)
  }
  return value
}

const SUPABASE_URL = requireEnv("SUPABASE_URL")
const SUPABASE_ANON_KEY = requireEnv("SUPABASE_ANON_KEY")
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY")

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function authorize(authorizationHeader: string | null): Promise<AuthorizeResult> {
  if (!authorizationHeader?.startsWith("Bearer ")) return { authorized: false, status: 401 }
  const jwt = authorizationHeader.slice("Bearer ".length).trim()
  if (!jwt) return { authorized: false, status: 401 }

  const { data: userData, error: userError } = await serviceClient.auth.getUser(jwt)
  if (userError || !userData.user) return { authorized: false, status: 401 }

  // Client escopado à requisição (ANON key + o Authorization original) —
  // é isso que faz auth.uid() resolver corretamente dentro de
  // public.is_equipe() no lado do Postgres/PostgREST.
  const requestScopedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorizationHeader } },
  })
  const { data: isEquipeData, error: isEquipeError } = await requestScopedClient.rpc("is_equipe")
  if (isEquipeError || isEquipeData !== true) return { authorized: false, status: 403 }

  return { authorized: true, uid: userData.user.id }
}

Deno.serve(
  createListAmbassadorsAdminHandler({
    allowedOrigins: allowedOrigins(),
    authorize,
    listEmbaixadoras: async () => {
      // SELECT explícito — nunca "*". Só os 10 campos que o Admin V1
      // precisa; nunca invite_token_hash/invite_claim_*/
      // invite_expira_em/invite_token_usado_em/user_id/aprovada_por (ver
      // auditoria E2.3-A, seção G). `updated_at` adicionado na E2.6-A: é o
      // valor que o Admin devolve como `expected_updated_at` ao chamar
      // resend-ambassador-invite (bloqueio otimista contra dois reenvios
      // concorrentes) — não é sensível (é só um timestamp de última
      // escrita, já usado como bloqueio em várias tabelas do projeto).
      const { data, error } = await serviceClient
        .from("embaixadoras")
        .select(
          "id, nome, telefone_normalizado, email, instagram, codigo_referral, status, created_at, aprovada_em, updated_at",
        )
        .order("created_at", { ascending: false })
      if (error) throw error
      return (data ?? []) as EmbaixadoraRow[]
    },
    // Log estruturado e minimizado — nunca grava nome, telefone, e-mail,
    // instagram ou a lista em si, só metadados (mesmo espírito de
    // create-ambassador-invite/index.ts).
    logEvent: (fields) =>
      console.log(JSON.stringify({ fn: "list-ambassadors-admin", ts: new Date().toISOString(), ...fields })),
  }),
)
