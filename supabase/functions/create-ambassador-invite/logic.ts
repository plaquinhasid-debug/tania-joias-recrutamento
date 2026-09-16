// logic.ts — lógica pura (sem I/O) de `create-ambassador-invite`. Extraído
// pra ser testável direto via node:test, mesmo padrão de
// finalize-candidate/logic.ts e get-ficha/handler.ts. `index.ts` continua
// sendo o único ponto de I/O (Supabase Auth, banco) — nenhuma função aqui
// faz rede/banco.
//
// IMPORT DE packages/shared/src/phone.ts — ver auditoria E2.2-A, item H:
// o arquivo não tem nenhum import próprio (nem "zod", nem nada Node-only),
// então um caminho relativo direto (contornando packages/shared/src/index.ts,
// que puxaria "zod" via specifier livre e quebraria no Deno sem import
// map) deveria resolver normalmente tanto em Node quanto em Deno. ISSO NÃO
// FOI COMPROVADO COM DENO REAL nesta etapa (ambiente sem Deno/Supabase CLI
// instalado — ver relatório da E2.2-C1, item U). Se o deploy da E2.2-C2
// mostrar que o bundler do Supabase não alcança arquivos fora de
// supabase/functions/<fn>/, o fallback documentado é copiar phone.ts
// literalmente para supabase/functions/_shared/phone.ts (mesmo padrão já
// usado para normalizeBrazilPhone em _shared/whatsapp-cloud-api.ts), nunca
// reimplementar a regra de negócio.
import { normalizeBrazilianPhone } from "../../../packages/shared/src/phone.ts"

export { normalizeBrazilianPhone }

export const NOME_MAX_LENGTH = 120
// 254 = limite prático de e-mail (RFC 5321, comprimento total do path),
// não uma validação RFC 5322 completa — pragmático, não exaustivo.
export const EMAIL_MAX_LENGTH = 254
export const INSTAGRAM_MAX_LENGTH = 60
export const CODIGO_REFERRAL_LENGTH = 8
// Alfabeto sem caracteres ambíguos: sem I, L, O (letras) e sem 0, 1
// (dígitos) — pedido explícito da E2.2-C1, seção 12.
export const CODIGO_REFERRAL_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
export const CODIGO_REFERRAL_MAX_ATTEMPTS = 5
export const INVITE_TOKEN_BYTES = 32

export type ValidationResult<T> = { valid: true; value: T } | { valid: false; reason: string }

/** Nome: só trim, nunca mexe em capitalização. Vazio ou vazio-após-trim -> inválido. */
export function validateNome(raw: unknown): ValidationResult<string> {
  if (typeof raw !== "string") return { valid: false, reason: "nome_obrigatorio" }
  const nome = raw.trim()
  if (nome.length === 0) return { valid: false, reason: "nome_obrigatorio" }
  if (nome.length > NOME_MAX_LENGTH) return { valid: false, reason: "nome_muito_longo" }
  return { valid: true, value: nome }
}

// Validação pragmática de formato — não é um parser RFC 5322 completo, de
// propósito (pedido explícito da E2.2-C1, seção 8).
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** trim + lowercase, depois validação de formato pragmática. O UNIQUE INDEX em lower(email) do banco continua sendo a garantia final — isto aqui é só a primeira linha de defesa (melhor mensagem de erro, menos idas ao banco). */
export function normalizeAndValidateEmail(raw: unknown): ValidationResult<string> {
  if (typeof raw !== "string") return { valid: false, reason: "email_obrigatorio" }
  const email = raw.trim().toLowerCase()
  if (email.length === 0) return { valid: false, reason: "email_obrigatorio" }
  if (email.length > EMAIL_MAX_LENGTH) return { valid: false, reason: "email_muito_longo" }
  if (!EMAIL_FORMAT.test(email)) return { valid: false, reason: "email_invalido" }
  return { valid: true, value: email }
}

/** Opcional: ausente/vazio/só espaço -> null. Nunca exige "@". Nunca bloqueia o convite por ausência. */
export function normalizeInstagram(raw: unknown): ValidationResult<string | null> {
  if (raw === undefined || raw === null) return { valid: true, value: null }
  if (typeof raw !== "string") return { valid: false, reason: "instagram_invalido" }
  const instagram = raw.trim()
  if (instagram.length === 0) return { valid: true, value: null }
  if (instagram.length > INSTAGRAM_MAX_LENGTH) return { valid: false, reason: "instagram_muito_longo" }
  return { valid: true, value: instagram }
}

/**
 * Gera o codigo_referral: só o sufixo aleatório importa — nunca deriva de
 * nome/telefone/email/timestamp/contador. `randomBytes` é injetado (nunca
 * `Math.random`) — em produção é `crypto.getRandomValues`.
 *
 * O alfabeto tem 31 caracteres, que NÃO divide 256 igualmente (256 = 8*31
 * + 8) — sem cuidado, `byte % 31` favoreceria levemente os primeiros 8
 * caracteres do alfabeto. Por isso descarta (rejection sampling) bytes
 * >= 248 (8*31) antes de mapear pro alfabeto, garantindo distribuição
 * uniforme de verdade, não só "aleatório o bastante".
 */
export function generateCodigoReferral(randomBytes: (n: number) => Uint8Array): string {
  const alphabetLength = CODIGO_REFERRAL_ALPHABET.length
  const maxUnbiased = Math.floor(256 / alphabetLength) * alphabetLength
  const chars: string[] = []
  while (chars.length < CODIGO_REFERRAL_LENGTH) {
    const batch = randomBytes(CODIGO_REFERRAL_LENGTH - chars.length)
    for (const byte of batch) {
      if (byte >= maxUnbiased) continue
      chars.push(CODIGO_REFERRAL_ALPHABET[byte % alphabetLength])
      if (chars.length === CODIGO_REFERRAL_LENGTH) break
    }
  }
  return chars.join("")
}

/** 32 bytes criptograficamente aleatórios — o token bruto do convite. */
export function generateInviteTokenBytes(randomBytes: (n: number) => Uint8Array): Uint8Array {
  return randomBytes(INVITE_TOKEN_BYTES)
}

/** base64url SEM padding (RFC 4648 §5) — mesma codificação usada na URL do convite. */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = ""
  for (const b of bytes) binary += String.fromCharCode(b)
  const base64 = btoa(binary)
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/**
 * SHA-256 hex minúsculo — mesmo formato/algoritmo do helper `sha256Hex` já
 * existente em `supabase/functions/_shared/meta-conversions.ts` (não
 * importado de lá porque não é exportado por aquele módulo; reimplementação
 * de 6 linhas idêntica, não uma regra nova). Hasheia a STRING do token
 * (formato que efetivamente trafega na URL/no resgate), não os bytes
 * brutos.
 */
export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

export type EmbaixadoraStatus = "convidada" | "ativa" | "inativa" | "rejeitada"

export interface DuplicateConflict {
  code: string
  message: string
}

/** Regra V1 (E2.2-C1, seção 13): uma pessoa = uma linha. Nenhum status aqui cria uma segunda linha. */
export function classifyDuplicateConflict(status: EmbaixadoraStatus): DuplicateConflict {
  switch (status) {
    case "convidada":
      return { code: "convite_ja_existe", message: "Já existe um convite pendente para esta pessoa." }
    case "ativa":
      return { code: "embaixadora_ja_ativa", message: "Esta pessoa já é uma Embaixadora ativa." }
    case "inativa":
      return { code: "embaixadora_inativa", message: "Já existe um cadastro inativo para esta pessoa." }
    case "rejeitada":
      return { code: "embaixadora_rejeitada", message: "Já existe um cadastro rejeitado para esta pessoa." }
  }
}

export type UniqueViolationTarget = "telefone" | "email" | "codigo_referral" | "invite_token_hash" | "unknown"

/** Nomes reais das constraints/índices únicos de public.embaixadoras (E1/E2.1/E2.2-B). */
export function classifyUniqueViolation(constraintName: string | null | undefined): UniqueViolationTarget {
  switch (constraintName) {
    case "embaixadoras_telefone_normalizado_key":
      return "telefone"
    case "embaixadoras_email_lower_unique_idx":
      return "email"
    case "embaixadoras_codigo_referral_key":
      return "codigo_referral"
    case "embaixadoras_invite_token_hash_key":
      return "invite_token_hash"
    default:
      return "unknown"
  }
}
