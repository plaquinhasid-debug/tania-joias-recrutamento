// _shared/phone.ts (IMPLEMENTATION-EMBAIXADORAS-E2.8)
//
// Cópia de packages/shared/src/phone.ts (normalizeBrazilianPhone), mesma
// disciplina já usada em _shared/whatsapp-cloud-api.ts (normalizeBrazilPhone,
// versão mais crua): Edge Functions (Deno, sem import_map) não conseguem
// importar de packages/shared quando deployadas via upload de arquivo a
// arquivo (só um import relativo saindo do repo real, resolvido pela CLI
// local, funciona — não é o caso deste deploy). finalize-candidate já usa a
// convenção "source/index.ts" + "_shared/*.ts" siblings (sem espelhar a
// árvore real do repo), então um import de 3 níveis acima escaparia do
// bundle. Duplicação deliberada, não um erro — nunca reimplementação
// divergente: cópia byte a byte da função pura de packages/shared/src/phone.ts.
//
// Se algum dia este arquivo e o de packages/shared divergirem, a fonte de
// verdade da REGRA DE NEGÓCIO é sempre packages/shared/src/phone.ts — este
// arquivo existe só pela limitação de empacotamento deste deploy específico.

/** DDDs oficiais do Brasil (ANATEL) — lista fixa e conhecida, não é uma faixa numérica genérica. */
const VALID_BRAZILIAN_DDDS: ReadonlySet<number> = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24,
  27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46,
  47, 48, 49,
  51, 53, 54, 55,
  61,
  62, 64,
  63,
  65, 66,
  67,
  68,
  69,
  71, 73, 74, 75, 77,
  79,
  81, 87,
  82,
  83,
  84,
  85, 88,
  86, 89,
  91, 93, 94,
  92, 97,
  95,
  96,
  98, 99,
])

export type BrazilianPhoneKind = "mobile" | "landline" | "mobile_legacy_8_digits"

export type NormalizedBrazilianPhone = {
  readonly valid: true
  readonly e164: string
  readonly ddd: string
  readonly localNumber: string
  readonly kind: BrazilianPhoneKind
}

export type InvalidBrazilianPhoneReason =
  | "empty"
  | "too_short"
  | "too_long"
  | "unsupported_country_code"
  | "invalid_ddd"
  | "invalid_local_number"

export type InvalidBrazilianPhone = {
  readonly valid: false
  readonly reason: InvalidBrazilianPhoneReason
}

export type PhoneNormalizationResult = NormalizedBrazilianPhone | InvalidBrazilianPhone

export function normalizeBrazilianPhone(
  input: string | null | undefined,
): PhoneNormalizationResult {
  const digits = (input ?? "").replace(/\D/g, "")

  if (digits.length === 0) return { valid: false, reason: "empty" }
  if (digits.length < 10) return { valid: false, reason: "too_short" }
  if (digits.length > 13) return { valid: false, reason: "too_long" }

  let localWithDdd: string
  if (digits.length === 12 || digits.length === 13) {
    if (!digits.startsWith("55")) return { valid: false, reason: "unsupported_country_code" }
    localWithDdd = digits.slice(2)
  } else {
    localWithDdd = digits
  }

  const ddd = localWithDdd.slice(0, 2)
  const localNumber = localWithDdd.slice(2)

  if (!VALID_BRAZILIAN_DDDS.has(Number(ddd))) {
    return { valid: false, reason: "invalid_ddd" }
  }

  let kind: BrazilianPhoneKind
  if (localNumber.length === 9) {
    if (localNumber[0] !== "9") return { valid: false, reason: "invalid_local_number" }
    kind = "mobile"
  } else if (localNumber.length === 8) {
    const firstDigit = localNumber[0]
    if (firstDigit >= "6" && firstDigit <= "9") {
      kind = "mobile_legacy_8_digits"
    } else if (firstDigit >= "2" && firstDigit <= "5") {
      kind = "landline"
    } else {
      return { valid: false, reason: "invalid_local_number" }
    }
  } else {
    return { valid: false, reason: "invalid_local_number" }
  }

  return {
    valid: true,
    e164: `55${ddd}${localNumber}`,
    ddd,
    localNumber,
    kind,
  }
}
