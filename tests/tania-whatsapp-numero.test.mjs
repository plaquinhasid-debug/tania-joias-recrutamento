import test from "node:test"
import assert from "node:assert/strict"

// Shim mínimo do global `Deno` — só o suficiente pra `getTaniaWhatsappNumero`
// (`_shared/tania-whatsapp-numero.ts`) rodar sob Node/`node --test`. Nunca
// sobrescreve um `Deno` real, caso um dia este arquivo rode sob Deno de
// verdade.
globalThis.Deno ??= { env: { get: () => undefined } }

const { getTaniaWhatsappNumero } = await import(
  "../supabase/functions/_shared/tania-whatsapp-numero.ts"
)

// -----------------------------------------------------------------------
// IMPLEMENTATION-CRM-004B (item 4/12) — settings.tania_whatsapp_numero é a
// fonte principal; env var TANIA_WHATSAPP_NOTIFICATION_NUMBER só entra como
// fallback de indisponibilidade. Nunca hardcoded.
// -----------------------------------------------------------------------

function fakeSupabase(settingsResponse) {
  return {
    from(table) {
      assert.equal(table, "settings")
      return {
        select() {
          return this
        },
        eq(coluna, valor) {
          assert.equal(coluna, "chave")
          assert.equal(valor, "tania_whatsapp_numero")
          return this
        },
        maybeSingle() {
          return settingsResponse
        },
      }
    },
  }
}

test("settings com número válido -> usa settings, nunca toca no env var", async () => {
  const supabase = fakeSupabase(Promise.resolve({ data: { valor: { numero: "5511946370390" } } }))
  const numero = await getTaniaWhatsappNumero(supabase)
  assert.equal(numero, "5511946370390")
})

test("settings sem a linha (data null) -> cai pro fallback do env var", async () => {
  const original = globalThis.Deno.env.get
  globalThis.Deno.env.get = (key) =>
    key === "TANIA_WHATSAPP_NOTIFICATION_NUMBER" ? "5511900000000" : undefined
  try {
    const supabase = fakeSupabase(Promise.resolve({ data: null }))
    const numero = await getTaniaWhatsappNumero(supabase)
    assert.equal(numero, "5511900000000")
  } finally {
    globalThis.Deno.env.get = original
  }
})

test("settings indisponível (lança) -> cai pro fallback do env var, nunca propaga o erro", async () => {
  const original = globalThis.Deno.env.get
  globalThis.Deno.env.get = (key) =>
    key === "TANIA_WHATSAPP_NOTIFICATION_NUMBER" ? "5511900000001" : undefined
  try {
    const supabase = fakeSupabase(Promise.reject(new Error("db indisponível")))
    const numero = await getTaniaWhatsappNumero(supabase)
    assert.equal(numero, "5511900000001")
  } finally {
    globalThis.Deno.env.get = original
  }
})

test("nem settings nem env var -> null, nunca lança (best-effort)", async () => {
  const original = globalThis.Deno.env.get
  globalThis.Deno.env.get = () => undefined
  try {
    const supabase = fakeSupabase(Promise.resolve({ data: null }))
    const numero = await getTaniaWhatsappNumero(supabase)
    assert.equal(numero, null)
  } finally {
    globalThis.Deno.env.get = original
  }
})

test("valor.numero vazio/só espaço em settings -> trata como ausente, tenta fallback", async () => {
  const original = globalThis.Deno.env.get
  globalThis.Deno.env.get = (key) =>
    key === "TANIA_WHATSAPP_NOTIFICATION_NUMBER" ? "5511900000002" : undefined
  try {
    const supabase = fakeSupabase(Promise.resolve({ data: { valor: { numero: "   " } } }))
    const numero = await getTaniaWhatsappNumero(supabase)
    assert.equal(numero, "5511900000002")
  } finally {
    globalThis.Deno.env.get = original
  }
})
