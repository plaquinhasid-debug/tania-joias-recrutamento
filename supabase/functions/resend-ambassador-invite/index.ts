// Edge Function: resend-ambassador-invite (E2.6-A)
//
// Reemite o convite de uma Embaixadora já existente (status='convidada'):
// gera um token bruto novo, grava só o novo hash (invalidando o anterior
// pela substituição), renova invite_expira_em por mais 7 dias. Nasceu de um
// achado operacional real na E2.5-F2-C: o invite_url só existe no estado
// React efêmero do diálogo de criação — se a equipe fechar o modal sem
// copiar, o token bruto correspondente ao hash salvo é permanentemente
// irrecuperável (hash é SHA-256, unidirecional). Esta function é o único
// caminho de recuperação: nunca "recupera" o token antigo (impossível por
// design), sempre emite um convite NOVO para a MESMA linha.
//
// AUTORIZAÇÃO — idêntica a create-ambassador-invite/index.ts (mesmo
// `authorize`, duplicado de propósito, não importado de lá — ver
// comentário em list-ambassadors-admin/logic.ts sobre isolamento entre
// functions administrativas): JWT real + public.is_equipe() via RPC, nunca
// confia em nada vindo do body.
//
// CORS — mesma allowlist de create-ambassador-invite (EMBAIXADORAS_ALLOWED_ORIGINS):
// esta function só é chamada do Admin, nunca da Landing.
//
// CONCORRÊNCIA — a decisão real (se o reenvio aconteceu) é 100% da RPC
// resend_ambassador_invite (UPDATE...WHERE...RETURNING atômico, ver
// migration 20260917000000). Se a RPC devolver 0 linhas, esta function faz
// UMA leitura diagnóstica SEPARADA (read-only, best-effort) só para
// escolher a MENSAGEM de erro certa — essa leitura nunca decide nada, só
// explica uma decisão que a RPC já tomou.
import { createClient } from "npm:@supabase/supabase-js@2"

import { createResendAmbassadorInviteHandler, type AuthorizeResult, type ResendResult } from "./handler.ts"
import { classifyResendFailure } from "./logic.ts"

function allowedOrigins(): string[] {
  return (Deno.env.get("EMBAIXADORAS_ALLOWED_ORIGINS") ?? Deno.env.get("AGENT_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
}

// Mesma disciplina de create-ambassador-invite/index.ts: `!` sozinho não
// valida nada em runtime — requireEnv falha alto no boot do módulo se a env
// var estiver ausente ou vazia.
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
// Mesmo valor de create-ambassador-invite — sem fallback hardcoded de
// propósito, ver comentário lá.
const EMBAIXADORAS_INVITE_BASE_URL = requireEnv("EMBAIXADORAS_INVITE_BASE_URL")

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// Idêntica a create-ambassador-invite/index.ts:authorize — duplicada de
// propósito (mesmo motivo de sha256Hex duplicado entre functions).
async function authorize(authorizationHeader: string | null): Promise<AuthorizeResult> {
  if (!authorizationHeader?.startsWith("Bearer ")) return { authorized: false, status: 401 }
  const jwt = authorizationHeader.slice("Bearer ".length).trim()
  if (!jwt) return { authorized: false, status: 401 }

  const { data: userData, error: userError } = await serviceClient.auth.getUser(jwt)
  if (userError || !userData.user) return { authorized: false, status: 401 }

  const requestScopedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorizationHeader } },
  })
  const { data: isEquipeData, error: isEquipeError } = await requestScopedClient.rpc("is_equipe")
  if (isEquipeError || isEquipeData !== true) return { authorized: false, status: 403 }

  return { authorized: true, uid: userData.user.id }
}

Deno.serve(
  createResendAmbassadorInviteHandler({
    allowedOrigins: allowedOrigins(),
    inviteBaseUrl: EMBAIXADORAS_INVITE_BASE_URL,
    randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
    now: () => Date.now(),
    authorize,

    resendInvite: async ({ embaixadoraId, expectedUpdatedAt, newTokenHash, newExpiraEm }): Promise<ResendResult> => {
      const { data, error } = await serviceClient.rpc("resend_ambassador_invite", {
        p_embaixadora_id: embaixadoraId,
        p_expected_updated_at: expectedUpdatedAt,
        p_new_token_hash: newTokenHash,
        p_new_expira_em: newExpiraEm,
      })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : null
      if (row) return { ok: true, embaixadoraId: row.id, inviteExpiraEm: row.invite_expira_em }

      // 0 linhas: a RPC já decidiu que não houve reenvio. Esta leitura é só
      // diagnóstico (nunca decisória) para escolher a mensagem certa — se
      // ela mesma falhar ou não achar nada, cai no "not_found" genérico.
      const diagnostic = await serviceClient
        .from("embaixadoras")
        .select("status, invite_token_usado_em, invite_claimed_em, invite_claim_expira_em")
        .eq("id", embaixadoraId)
        .maybeSingle()
      const reason = classifyResendFailure(diagnostic.error ? null : diagnostic.data)
      return { ok: false, reason }
    },

    // Log estruturado e minimizado — mesma disciplina de
    // create-ambassador-invite/index.ts: nunca token, invite_url, nome,
    // e-mail ou telefone.
    logEvent: (fields) =>
      console.log(JSON.stringify({ fn: "resend-ambassador-invite", ts: new Date().toISOString(), ...fields })),
  }),
)
