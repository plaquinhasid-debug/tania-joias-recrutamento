// Normalização e validação de números de telefone brasileiros —
// IMPLEMENTATION-EMBAIXADORAS-E0. Criada para servir de base futura à
// deduplicação de indicação por telefone ("primeira indicação válida
// vence"), mas por enquanto NÃO é usada por nenhum fluxo existente —
// ver auditoria/relatório da E0.
//
// Determinística, sem efeitos colaterais, sem chamada de rede/banco.
// Usável em apps/landing e apps/admin (via `@tania-joias/shared`). As
// Edge Functions em supabase/functions/* (Deno, sem import_map) NÃO
// conseguem importar daqui hoje — mesma limitação que já forçou a
// existência de `normalizeBrazilPhone` duplicada em
// supabase/functions/_shared/whatsapp-cloud-api.ts. Resolver isso é
// decisão de uma etapa futura, não desta.
//
// Por que uma implementação nova em vez de reaproveitar as 3 já
// existentes (apps/admin/src/lib/format.ts, _shared/whatsapp-cloud-api.ts,
// _shared/meta-conversions.ts): nenhuma valida DDD nem distingue entrada
// válida de inválida, e todas decidem "já tem DDI 55" só verificando se a
// string COMEÇA com "55" — o que é errado para quem mora nos DDDs
// 51/53/54/55 (RS) e digita o número sem o "+55" na frente (ex.:
// "55 98888-7777", 11 dígitos, DDD 55 + celular) — a lógica antiga devolve
// esse número incompleto (11 dígitos) em vez de completar com o DDI de
// verdade (13 dígitos). Esta função decide isso pela QUANTIDADE de
// dígitos, nunca pelo prefixo.

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

/**
 * `mobile`: 9 dígitos locais começando com "9" (celular moderno).
 * `landline`: 8 dígitos locais começando com 2-5 (fixo).
 * `mobile_legacy_8_digits`: 8 dígitos locais começando com 6-9 (celular
 * anterior ao nono dígito nacional) — NUNCA "corrigido" para 9 dígitos
 * automaticamente por esta função.
 *
 * Decisão de negócio deliberadamente NÃO tomada aqui: se `landline` e/ou
 * `mobile_legacy_8_digits` são elegíveis para um fluxo específico (ex.:
 * programa Embaixadoras) é decisão de quem for integrar esta função.
 */
export type BrazilianPhoneKind = "mobile" | "landline" | "mobile_legacy_8_digits"

export type NormalizedBrazilianPhone = {
  readonly valid: true
  /** Formato canônico: "55" + DDD (2) + número local (8 ou 9), só dígitos. */
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

/**
 * Normaliza e valida um telefone brasileiro (celular ou fixo) a partir de
 * qualquer formatação de entrada (espaços, parênteses, hífen, "+55" etc).
 *
 * Só retorna `valid: true` quando o resultado é estruturalmente um
 * telefone brasileiro plausível (DDI 55 opcional + DDD real da ANATEL +
 * número local de 8 ou 9 dígitos seguindo a regra do nono dígito). Nunca
 * transforma entrada inválida em número válido silenciosamente.
 *
 * Idempotente para entradas válidas: se `r = normalizeBrazilianPhone(x)` e
 * `r.valid === true`, então `normalizeBrazilianPhone(r.e164)` é igual a
 * `r` campo a campo.
 */
export function normalizeBrazilianPhone(
  input: string | null | undefined,
): PhoneNormalizationResult {
  const digits = (input ?? "").replace(/\D/g, "")

  if (digits.length === 0) return { valid: false, reason: "empty" }
  if (digits.length < 10) return { valid: false, reason: "too_short" }
  if (digits.length > 13) return { valid: false, reason: "too_long" }

  let localWithDdd: string
  if (digits.length === 12 || digits.length === 13) {
    // Só assume DDI 55 quando o tamanho bate com "55 + DDD + local" —
    // nunca só porque a string começa com "55" (ver comentário no topo).
    if (!digits.startsWith("55")) return { valid: false, reason: "unsupported_country_code" }
    localWithDdd = digits.slice(2)
  } else {
    localWithDdd = digits // 10 ou 11 dígitos: DDD + local, sem DDI
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
    // Inalcançável: localWithDdd sempre tem 10 ou 11 dígitos neste ponto
    // (ver ramos acima), então localNumber sempre tem 8 ou 9. Mantido por
    // clareza/segurança, no mesmo espírito defensivo do resto do repo.
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
