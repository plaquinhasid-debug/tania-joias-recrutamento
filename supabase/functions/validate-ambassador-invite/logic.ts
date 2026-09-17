// logic.ts — lógica pura (sem I/O) de `validate-ambassador-invite`. Mesmo
// padrão de create-ambassador-invite/logic.ts: testável direto via
// node:test, nenhuma função aqui faz rede/banco.

// Token bruto real tem sempre ~43 chars (32 bytes -> base64url sem padding,
// ver create-ambassador-invite/handler.ts). Os limites abaixo são
// deliberadamente mais largos — não são um contrato de formato exato, só
// uma rejeição barata de lixo óbvio (vazio, JSON aninhado, payload enorme)
// ANTES de gastar um sha256+consulta ao banco. A fonte de verdade de
// validade continua sendo o hash bater com invite_token_hash no banco.
export const TOKEN_MIN_LENGTH = 16
export const TOKEN_MAX_LENGTH = 256
const TOKEN_FORMAT = /^[A-Za-z0-9_-]+$/ // alfabeto base64url

export function isPlausibleToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= TOKEN_MIN_LENGTH &&
    value.length <= TOKEN_MAX_LENGTH &&
    TOKEN_FORMAT.test(value)
  )
}

/** SHA-256 hex minúsculo — mesmo formato/algoritmo de create-ambassador-invite/logic.ts (reimplementação de 6 linhas idêntica, não uma regra nova, ver comentário lá). */
export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

export type EmbaixadoraStatus = "convidada" | "ativa" | "inativa" | "rejeitada"

export interface InviteLookup {
  nome: string
  email: string
  status: EmbaixadoraStatus
  inviteTokenUsadoEm: string | null
  inviteExpiraEm: string
}

/**
 * Convite elegível pra seguir pro redemption: status ainda "convidada",
 * nunca usado, e ainda não expirado. Deliberadamente NÃO considera
 * invite_claim_id/invite_claimed_em/invite_claim_expira_em — um claim
 * ativo de outra aba/tentativa é um detalhe de contenção interno, resolvido
 * só no momento do redemption (RPC claim_ambassador_invite), nunca aqui.
 * Expor isso em validate() vazaria timing de uma tentativa concorrente sem
 * nenhum benefício acionável pra quem está só abrindo a página.
 */
export function isInviteRedeemable(lookup: InviteLookup, nowMs: number): boolean {
  if (lookup.status !== "convidada") return false
  if (lookup.inviteTokenUsadoEm !== null) return false
  const expiraEmMs = new Date(lookup.inviteExpiraEm).getTime()
  return Number.isFinite(expiraEmMs) && expiraEmMs > nowMs
}
