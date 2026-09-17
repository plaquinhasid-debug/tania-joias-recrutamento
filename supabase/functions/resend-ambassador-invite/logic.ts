// logic.ts — lógica pura (sem I/O) de `resend-ambassador-invite`. Mesmo
// padrão de create-ambassador-invite/logic.ts. index.ts continua sendo o
// único ponto de I/O real (RPC Postgres via service role) — nenhuma função
// aqui faz rede/banco.
//
// `generateInviteTokenBytes`/`toBase64Url`/`sha256Hex` são DUPLICADOS de
// create-ambassador-invite/logic.ts — mesma reimplementação de propósito
// (não compartilhada entre diretórios de function, ver
// redeem-ambassador-invite/logic.ts pro mesmo padrão já estabelecido com
// sha256Hex): cada function fica bundlável/auditável sozinha.

export const INVITE_TOKEN_BYTES = 32
export const INVITE_EXPIRA_EM_DAYS = 7

/** 32 bytes criptograficamente aleatórios — o token bruto do novo convite. Idêntico a create-ambassador-invite/logic.ts. */
export function generateInviteTokenBytes(randomBytes: (n: number) => Uint8Array): Uint8Array {
  return randomBytes(INVITE_TOKEN_BYTES)
}

/** base64url SEM padding (RFC 4648 §5) — mesma codificação de create-ambassador-invite/logic.ts. */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = ""
  for (const b of bytes) binary += String.fromCharCode(b)
  const base64 = btoa(binary)
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/** SHA-256 hex minúsculo — mesma reimplementação de 6 linhas de create-ambassador-invite/logic.ts. */
export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

/** now() + 7 dias — mesma política de invite_expira_em já usada na criação (migration 20260915190000). Calculado aqui (não no banco) porque a RPC recebe o valor pronto, não um INTERVAL. */
export function computeNewExpiraEm(now: () => number = () => Date.now()): string {
  return new Date(now() + INVITE_EXPIRA_EM_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

const UUID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Validação estrutural de formato — a autoridade real de "esta Embaixadora existe" é sempre a RPC (0 linhas = não existe/não elegível), nunca esta função. */
export function isPlausibleEmbaixadoraId(value: unknown): value is string {
  return typeof value === "string" && UUID_FORMAT.test(value)
}

/** `expected_updated_at` chega como o ISO string que list-ambassadors-admin devolveu — só validamos formato/parseabilidade aqui, nunca reescrevemos o valor (precisa bater exatamente com o que está no banco). */
export function isPlausibleUpdatedAt(value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length === 0) return false
  const parsed = Date.parse(value)
  return Number.isFinite(parsed)
}

export type ResendFailureReason =
  | "not_found"
  | "nao_convidada"
  | "resgate_em_andamento"
  | "estado_desatualizado"

/**
 * Classifica por que a RPC devolveu 0 linhas, a partir de uma leitura
 * diagnóstica SEPARADA feita depois (nunca antes — ver index.ts). Puramente
 * cosmética: só melhora a mensagem de erro pra equipe, NUNCA decide se o
 * reenvio aconteceu (isso já foi decidido, de forma atômica, só pela RPC).
 * `row` pode ser `null` (linha não existe/não foi encontrada na leitura
 * diagnóstica também, ou já não corresponde mais a nada útil).
 */
export function classifyResendFailure(row: {
  status: string
  invite_token_usado_em: string | null
  invite_claimed_em: string | null
  invite_claim_expira_em: string | null
} | null): ResendFailureReason {
  if (!row) return "not_found"
  if (row.status !== "convidada" || row.invite_token_usado_em !== null) return "nao_convidada"
  const claimAtivo =
    row.invite_claimed_em !== null &&
    row.invite_claim_expira_em !== null &&
    new Date(row.invite_claim_expira_em).getTime() > Date.now()
  if (claimAtivo) return "resgate_em_andamento"
  // Status ainda 'convidada', sem uso, sem claim ativo, mas a RPC mesmo
  // assim devolveu 0 linhas -> só resta updated_at não bater mais (outra
  // escrita concorrente venceu a corrida).
  return "estado_desatualizado"
}
