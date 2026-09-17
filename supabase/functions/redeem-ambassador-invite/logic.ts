// logic.ts — lógica pura (sem I/O) de `redeem-ambassador-invite`. Mesmo
// padrão de create-ambassador-invite/logic.ts e
// validate-ambassador-invite/logic.ts.

export const TOKEN_MIN_LENGTH = 16
export const TOKEN_MAX_LENGTH = 256
const TOKEN_FORMAT = /^[A-Za-z0-9_-]+$/

export function isPlausibleToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= TOKEN_MIN_LENGTH &&
    value.length <= TOKEN_MAX_LENGTH &&
    TOKEN_FORMAT.test(value)
  )
}

/** SHA-256 hex minúsculo — mesma reimplementação de 6 linhas de create-ambassador-invite/logic.ts. */
export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

// ~3 minutos, conforme o desenho já aprovado em
// 20260915190000_add_embaixadoras_invite_hardening.sql (PARTE 2): a
// migration deliberadamente não fixa um default de TTL no banco porque é
// "detalhe de implementação da Edge Function, não política de negócio como
// invite_expira_em" — esta constante é essa decisão.
export const DEFAULT_CLAIM_TTL_SECONDS = 180

// Supabase Auth (GoTrue) usa 6 caracteres como mínimo padrão de senha —
// NÃO confirmado contra a configuração REAL deste projeto nesta rodada:
// não existe tabela SQL pública/auth exposta com esse valor (é config de
// plataforma — Authentication > Policies no Studio/Management API —, não
// de banco; auditado em E2.5-A e novamente aqui: `information_schema.
// tables` do schema `auth` não tem nenhuma tabela de config). Fallback
// documentado explicitamente, nunca inventado como se fosse confirmado.
// EMBAIXADORAS_MIN_PASSWORD_LENGTH (env var, ver index.ts) permite corrigir
// sem novo deploy de código assim que o valor real for confirmado.
export const MIN_PASSWORD_LENGTH_FALLBACK = 6
const MAX_PASSWORD_LENGTH = 128

export function isPlausiblePassword(value: unknown, minLength: number): value is string {
  return typeof value === "string" && value.length >= minLength && value.length <= MAX_PASSWORD_LENGTH
}
