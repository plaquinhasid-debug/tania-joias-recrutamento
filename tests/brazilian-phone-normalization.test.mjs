import test from "node:test"
import assert from "node:assert/strict"
import { normalizeBrazilianPhone } from "../packages/shared/src/phone.ts"

// -----------------------------------------------------------------------
// IMPLEMENTATION-EMBAIXADORAS-E0 — normalização/validação de telefone
// brasileiro. Função ainda NÃO conectada a nenhum fluxo de produção (ver
// relatório da E0) — estes testes só cobrem o contrato da própria função.
// -----------------------------------------------------------------------

const MOBILE_CANONICAL = {
  valid: true,
  e164: "5511999999999",
  ddd: "11",
  localNumber: "999999999",
  kind: "mobile",
}

// --- A. Celular com DDD, sem DDI ---------------------------------------

test("celular com DDD, formatado com parênteses/espaço/hífen -> canônico", () => {
  assert.deepEqual(normalizeBrazilianPhone("(11) 99999-9999"), MOBILE_CANONICAL)
})

test("celular com DDD, espaço sem parênteses -> mesmo canônico", () => {
  assert.deepEqual(normalizeBrazilianPhone("11 99999-9999"), MOBILE_CANONICAL)
})

test("celular com DDD, só dígitos -> mesmo canônico", () => {
  assert.deepEqual(normalizeBrazilianPhone("11999999999"), MOBILE_CANONICAL)
})

// --- B. Celular com DDI --------------------------------------------------

test("celular com DDI '+55' formatado -> mesmo canônico", () => {
  assert.deepEqual(normalizeBrazilianPhone("+55 11 99999-9999"), MOBILE_CANONICAL)
})

test("celular com DDI '55' sem '+' -> mesmo canônico", () => {
  assert.deepEqual(normalizeBrazilianPhone("55 11 99999-9999"), MOBILE_CANONICAL)
})

test("celular com DDI, só dígitos -> mesmo canônico", () => {
  assert.deepEqual(normalizeBrazilianPhone("5511999999999"), MOBILE_CANONICAL)
})

// --- C. Formatações mistas -------------------------------------------

test("mistura de '+', parênteses, espaço e hífen -> mesmo canônico", () => {
  assert.deepEqual(normalizeBrazilianPhone("+55 (11) 99999-9999"), MOBILE_CANONICAL)
})

test("pontos como separador também são ignorados -> mesmo canônico", () => {
  assert.deepEqual(normalizeBrazilianPhone("55.11.99999.9999"), MOBILE_CANONICAL)
})

// --- D. Idempotência -----------------------------------------------------

test("normalizar um número já normalizado retorna exatamente o mesmo valor", () => {
  const first = normalizeBrazilianPhone("(11) 99999-9999")
  assert.equal(first.valid, true)
  const second = normalizeBrazilianPhone(first.e164)
  assert.deepEqual(second, first)
})

test("idempotência também vale para fixo (8 dígitos)", () => {
  const first = normalizeBrazilianPhone("(11) 3333-4444")
  assert.equal(first.valid, true)
  const second = normalizeBrazilianPhone(first.e164)
  assert.deepEqual(second, first)
})

// --- E. Entradas inválidas ------------------------------------------------

test("string vazia -> invalid, reason empty", () => {
  assert.deepEqual(normalizeBrazilianPhone(""), { valid: false, reason: "empty" })
})

test("somente espaços -> invalid, reason empty", () => {
  assert.deepEqual(normalizeBrazilianPhone("   "), { valid: false, reason: "empty" })
})

test("texto sem nenhum dígito -> invalid, reason empty", () => {
  assert.deepEqual(normalizeBrazilianPhone("não tenho telefone"), { valid: false, reason: "empty" })
})

test("null/undefined -> invalid, reason empty (não lança exceção)", () => {
  assert.deepEqual(normalizeBrazilianPhone(null), { valid: false, reason: "empty" })
  assert.deepEqual(normalizeBrazilianPhone(undefined), { valid: false, reason: "empty" })
})

test("número curto demais -> invalid, reason too_short", () => {
  assert.deepEqual(normalizeBrazilianPhone("123"), { valid: false, reason: "too_short" })
  assert.deepEqual(normalizeBrazilianPhone("999999"), { valid: false, reason: "too_short" })
})

test("número longo demais -> invalid, reason too_long", () => {
  assert.deepEqual(normalizeBrazilianPhone("551199999999999999"), { valid: false, reason: "too_long" })
})

test("DDI estrangeiro (Reino Unido) -> invalid, reason unsupported_country_code", () => {
  // +44 20 7946 0958 -> 12 dígitos, não começa com 55.
  assert.deepEqual(normalizeBrazilianPhone("+44 20 7946 0958"), {
    valid: false,
    reason: "unsupported_country_code",
  })
})

test("13 dígitos que não começam com 55 -> invalid, reason unsupported_country_code", () => {
  assert.deepEqual(normalizeBrazilianPhone("1234567890123"), {
    valid: false,
    reason: "unsupported_country_code",
  })
})

// --- F. Telefone fixo (ambiguidade documentada — ver relatório E0) ------

test("fixo com DDD válido, 8 dígitos começando 2-5 -> valid, kind landline", () => {
  assert.deepEqual(normalizeBrazilianPhone("(11) 3333-4444"), {
    valid: true,
    e164: "551133334444",
    ddd: "11",
    localNumber: "33334444",
    kind: "landline",
  })
})

// --- G. Número antigo / 8 dígitos: nunca inventar o nono dígito ---------

test("celular antigo de 8 dígitos (começando 6-9) -> valid, kind mobile_legacy_8_digits, SEM inserir 9", () => {
  const result = normalizeBrazilianPhone("(11) 8888-7777")
  assert.deepEqual(result, {
    valid: true,
    e164: "551188887777",
    ddd: "11",
    localNumber: "88887777",
    kind: "mobile_legacy_8_digits",
  })
  // Garantia explícita: a função NUNCA insere o dígito "9" sozinha.
  assert.equal(result.valid, true)
  assert.equal(result.localNumber.length, 8)
  assert.ok(!result.e164.includes("5511988887777"))
})

test("número local de 9 dígitos que NÃO começa com 9 -> invalid, reason invalid_local_number", () => {
  assert.deepEqual(normalizeBrazilianPhone("11812345678"), {
    valid: false,
    reason: "invalid_local_number",
  })
})

// --- H. DDD: não aceitar qualquer par de dígitos cegamente ---------------

test("DDD inexistente na ANATEL (10) -> invalid, reason invalid_ddd", () => {
  assert.deepEqual(normalizeBrazilianPhone("10999999999"), {
    valid: false,
    reason: "invalid_ddd",
  })
})

test("DDD inexistente na ANATEL (20) -> invalid, reason invalid_ddd", () => {
  assert.deepEqual(normalizeBrazilianPhone("2033334444"), {
    valid: false,
    reason: "invalid_ddd",
  })
})

test("todos os 67 DDDs oficiais são aceitos como válidos (celular canônico)", () => {
  const validDdds = [
    11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43,
    44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 64, 63, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77,
    79, 81, 87, 82, 83, 84, 85, 88, 86, 89, 91, 93, 94, 92, 97, 95, 96, 98, 99,
  ]
  assert.equal(validDdds.length, 67)
  for (const ddd of validDdds) {
    const result = normalizeBrazilianPhone(`${ddd}999999999`)
    assert.equal(result.valid, true, `DDD ${ddd} deveria ser válido`)
  }
})

// --- Bug documentado da implementação antiga (não reutilizada por isso) --

test("regressão do bug de DDI da implementação antiga: DDD 55 sem '+' na frente não é confundido com DDI", () => {
  // "55 98888-7777": DDD 55 (RS) + celular, 11 dígitos, SEM DDI.
  // A implementação ingênua existente (startsWith('55') ? digits : '55'+digits)
  // devolveria isso incompleto, como "55988887777" (11 dígitos). O correto é
  // completar com o DDI de verdade: "5555988887777" (13 dígitos).
  const result = normalizeBrazilianPhone("55 98888-7777")
  assert.deepEqual(result, {
    valid: true,
    e164: "5555988887777",
    ddd: "55",
    localNumber: "988887777",
    kind: "mobile",
  })
})
