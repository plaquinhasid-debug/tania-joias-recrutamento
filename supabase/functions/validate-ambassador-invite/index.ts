// Edge Function: validate-ambassador-invite (E2.5-B)
//
// Primeira chamada da futura página pública `/embaixadoras/convite/:token`
// (Landing, E2.5-D) — devolve se o convite ainda pode ser resgatado, sem
// nenhum efeito colateral. Só leitura: nunca adquire claim, nunca cria
// Auth user, nunca escreve em `embaixadoras`. O consumo real é
// redeem-ambassador-invite.
//
// CORS — allowlist dedicada (EMBAIXADORAS_REDEMPTION_ALLOWED_ORIGINS,
// fallback AGENT_ALLOWED_ORIGINS já usado por get-ficha/finalize-candidate
// como allowlist padrão de funções voltadas à Landing): a allowlist de
// create-ambassador-invite/list-ambassadors-admin (EMBAIXADORAS_ALLOWED_
// ORIGINS) é do Admin (recrutamento.taniajoiasmaua.com.br) — chamada de
// origem diferente da Landing (taniajoiasmaua.com.br), nunca reaproveitada
// aqui (ver auditoria E2.5-A, seção T).
import { createClient } from "npm:@supabase/supabase-js@2"

import { createValidateAmbassadorInviteHandler } from "./handler.ts"

function allowedOrigins(): string[] {
  return (
    Deno.env.get("EMBAIXADORAS_REDEMPTION_ALLOWED_ORIGINS") ?? Deno.env.get("AGENT_ALLOWED_ORIGINS") ?? ""
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
}

// Mesmo `requireEnv` de create-ambassador-invite/index.ts — falha alto no
// boot (antes de Deno.serve, antes de qualquer request) se a env var
// estiver ausente ou vazia, nunca deixa SUPABASE_URL/keys virarem
// `undefined`/`""` silenciosos em runtime.
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

Deno.serve(
  createValidateAmbassadorInviteHandler({
    allowedOrigins: allowedOrigins(),
    now: () => Date.now(),
    findByTokenHash: async (tokenHash) => {
      const { data, error } = await serviceClient
        .from("embaixadoras")
        .select("nome, email, status, invite_token_usado_em, invite_expira_em")
        .eq("invite_token_hash", tokenHash)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      return {
        nome: data.nome,
        email: data.email,
        status: data.status,
        inviteTokenUsadoEm: data.invite_token_usado_em,
        inviteExpiraEm: data.invite_expira_em,
      }
    },
  }),
)
