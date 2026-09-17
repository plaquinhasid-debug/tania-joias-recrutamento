// Edge Function: redeem-ambassador-invite (E2.5-B)
//
// Consome o convite: adquire um claim atômico (RPC), cria a conta Supabase
// Auth da Embaixadora, e finaliza (ou reverte) conforme o resultado. Único
// ponto de I/O real (RPCs Postgres via service role + Auth Admin API) —
// toda a lógica de decisão/saga vive em handler.ts, testável sem rede.
//
// SERVICE ROLE só aqui, nunca no browser — mesma disciplina de
// create-ambassador-invite/index.ts. Auth Admin API (createUser/deleteUser)
// também só aqui, pelo mesmo motivo.
//
// CORS — allowlist dedicada (EMBAIXADORAS_REDEMPTION_ALLOWED_ORIGINS,
// fallback AGENT_ALLOWED_ORIGINS), mesma justificativa de
// validate-ambassador-invite/index.ts: esta function é chamada da Landing,
// nunca do Admin — nunca reaproveita EMBAIXADORAS_ALLOWED_ORIGINS.
import { createClient } from "npm:@supabase/supabase-js@2"

import {
  createRedeemAmbassadorInviteHandler,
  type ClaimResult,
  type CreateAuthUserResult,
} from "./handler.ts"
import { DEFAULT_CLAIM_TTL_SECONDS, MIN_PASSWORD_LENGTH_FALLBACK } from "./logic.ts"

function allowedOrigins(): string[] {
  return (
    Deno.env.get("EMBAIXADORAS_REDEMPTION_ALLOWED_ORIGINS") ?? Deno.env.get("AGENT_ALLOWED_ORIGINS") ?? ""
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value || value.trim().length === 0) {
    throw new Error(`missing_required_env:${name}`)
  }
  return value
}

function minPasswordLength(): number {
  const raw = Deno.env.get("EMBAIXADORAS_MIN_PASSWORD_LENGTH")
  const parsed = raw ? Number(raw) : NaN
  // Nunca deixa um valor mal configurado (não numérico, zero, negativo)
  // enfraquecer a política de senha silenciosamente — cai pro fallback
  // documentado em logic.ts em vez de aceitar qualquer coisa.
  return Number.isFinite(parsed) && parsed > 0 ? parsed : MIN_PASSWORD_LENGTH_FALLBACK
}

const SUPABASE_URL = requireEnv("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY")

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

Deno.serve(
  createRedeemAmbassadorInviteHandler({
    allowedOrigins: allowedOrigins(),
    minPasswordLength: minPasswordLength(),
    claimTtlSeconds: DEFAULT_CLAIM_TTL_SECONDS,

    claimInvite: async ({ tokenHash, ttlSeconds }): Promise<ClaimResult | null> => {
      const { data, error } = await serviceClient.rpc("claim_ambassador_invite", {
        p_token_hash: tokenHash,
        p_ttl_seconds: ttlSeconds,
      })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : null
      if (!row) return null
      return {
        embaixadoraId: row.embaixadora_id,
        claimId: row.claim_id,
        nome: row.embaixadora_nome,
        email: row.embaixadora_email,
      }
    },

    createAuthUser: async ({ email, password, nome }): Promise<CreateAuthUserResult> => {
      const { data, error } = await serviceClient.auth.admin.createUser({
        email,
        password,
        // Sem fluxo de confirmação por e-mail nesta V1: o convite em si já
        // é a prova de legitimidade (link entregue pela equipe a uma
        // pessoa específica) — pedir confirmação de novo seria fricção sem
        // ganho de segurança real, e não há nenhum caminho de UI ainda pra
        // uma Embaixadora "não confirmada" tentar de novo depois.
        email_confirm: true,
        // Metadata mínima: só `nome`, o único campo que o trigger
        // pré-existente handle_new_user() lê (ver auditoria E2.5-A seção
        // P/R). NUNCA papel, telefone, codigo_referral, token, claim ou
        // senha — handle_new_user() nem olha pra esses campos, mas não há
        // motivo pra colocá-los lá de qualquer forma.
        user_metadata: { nome },
      })
      if (error) {
        // supabase-js/gotrue-js expõe `.code` em AuthApiError (não
        // reexportado por @supabase/supabase-js — duck-typing aqui evita
        // puxar mais um import npm: pra dentro do bundle da function).
        // "email_exists" é um ErrorCode documentado da lib instalada
        // (node_modules/@supabase/auth-js/dist/module/lib/error-codes.d.ts,
        // confirmado nesta rodada, não suposto). Usado só pra decidir a
        // MENSAGEM DE LOG interna — nunca pra decisão de segurança (nunca
        // vira "então vamos vincular esse usuário", ver handler.ts).
        const code = (error as { code?: string }).code
        if (code === "email_exists") return { ok: false, reason: "email_exists" }
        return { ok: false, reason: "unknown" }
      }
      if (!data.user) return { ok: false, reason: "unknown" }
      return { ok: true, userId: data.user.id }
    },

    finalizeInvite: async ({ embaixadoraId, claimId, userId }): Promise<boolean> => {
      const { data, error } = await serviceClient.rpc("finalize_ambassador_invite", {
        p_embaixadora_id: embaixadoraId,
        p_claim_id: claimId,
        p_user_id: userId,
      })
      if (error) throw error
      return data === true
    },

    releaseClaim: async ({ embaixadoraId, claimId }): Promise<void> => {
      const { error } = await serviceClient.rpc("release_ambassador_invite_claim", {
        p_embaixadora_id: embaixadoraId,
        p_claim_id: claimId,
      })
      if (error) throw error
    },

    deleteAuthUser: async (userId): Promise<boolean> => {
      const { error } = await serviceClient.auth.admin.deleteUser(userId)
      return !error
    },

    // Log estruturado minimizado — mesmo padrão de create-ambassador-
    // invite/index.ts: nunca token bruto, senha, invite_url ou e-mail.
    // embaixadoraId/userId são identificadores internos (uuid), não dado
    // pessoal por si só, e são o mínimo necessário pra suporte/auditoria
    // técnica localizar o registro certo.
    logEvent: (fields) =>
      console.log(JSON.stringify({ fn: "redeem-ambassador-invite", ts: new Date().toISOString(), ...fields })),
  }),
)
