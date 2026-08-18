import test from "node:test"
import assert from "node:assert/strict"
import { buildStatusPatch, extractStatusError, applyStatusUpdate } from "../apps/admin/api/webhooks/whatsapp.mjs"

// -----------------------------------------------------------------------
// IMPLEMENTATION-INTELLIGENCE-015B — a 015A comprovou que
// `whatsapp_enviado_em` só significa "a Meta aceitou a requisição", nunca
// "entregue"/"lida"/"falhou" de verdade. Estes testes cobrem o lado do
// webhook que processa `value.statuses` (antes só logado e descartado) e
// grava o status real, de forma idempotente, sem depender de ordem de
// chegada dos eventos.
// -----------------------------------------------------------------------

// C-G: buildStatusPatch para os 4 tipos reconhecidos + erro

test("C. status 'sent' -> patch em sent_at", () => {
  const built = buildStatusPatch({ id: "wamid.AAA", status: "sent", timestamp: "1755500000" })
  assert.equal(built.field, "sent_at")
  assert.equal(built.patch.status, "sent")
  assert.equal(built.patch.sent_at, new Date(1755500000 * 1000).toISOString())
  assert.ok(built.patch.updated_at)
  assert.equal(built.patch.error_code, undefined)
})

test("D. status 'delivered' -> patch em delivered_at", () => {
  const built = buildStatusPatch({ id: "wamid.AAA", status: "delivered", timestamp: "1755500100" })
  assert.equal(built.field, "delivered_at")
  assert.equal(built.patch.delivered_at, new Date(1755500100 * 1000).toISOString())
})

test("E. status 'read' -> patch em read_at", () => {
  const built = buildStatusPatch({ id: "wamid.AAA", status: "read", timestamp: "1755500200" })
  assert.equal(built.field, "read_at")
  assert.equal(built.patch.read_at, new Date(1755500200 * 1000).toISOString())
})

test("F. status 'failed' sem errors -> patch em failed_at, sem campos de erro", () => {
  const built = buildStatusPatch({ id: "wamid.AAA", status: "failed", timestamp: "1755500300" })
  assert.equal(built.field, "failed_at")
  assert.equal(built.patch.failed_at, new Date(1755500300 * 1000).toISOString())
  assert.equal(built.patch.error_code, undefined)
})

test("G. status 'failed' com errors -> captura code/title/message", () => {
  const built = buildStatusPatch({
    id: "wamid.AAA",
    status: "failed",
    timestamp: "1755500300",
    errors: [{ code: 131047, title: "Re-engagement message", message: "Mais de 24h desde a última mensagem" }],
  })
  assert.equal(built.patch.error_code, "131047")
  assert.equal(built.patch.error_title, "Re-engagement message")
  assert.equal(built.patch.error_message, "Mais de 24h desde a última mensagem")
})

test("G2. extractStatusError isolado: usa error_data.details quando não há message", () => {
  const err = extractStatusError({ errors: [{ code: 470, title: "Template paused", error_data: { details: "detalhe da meta" } }] })
  assert.equal(err.error_code, "470")
  assert.equal(err.error_message, "detalhe da meta")
})

test("G3. extractStatusError sem errors -> objeto vazio", () => {
  assert.deepEqual(extractStatusError({}), {})
})

// K: payload inválido / tipo desconhecido -> null, nunca lança

test("K. status.status desconhecido -> buildStatusPatch retorna null", () => {
  assert.equal(buildStatusPatch({ id: "wamid.AAA", status: "queued" }), null)
})

test("K2. status ausente/undefined -> buildStatusPatch retorna null, sem lançar", () => {
  assert.equal(buildStatusPatch(undefined), null)
  assert.equal(buildStatusPatch({}), null)
})

test("K3. timestamp ausente/inválido -> usa horário atual, não lança", () => {
  const built = buildStatusPatch({ id: "wamid.AAA", status: "sent", timestamp: "não-é-numero" })
  assert.equal(built.field, "sent_at")
  assert.ok(new Date(built.patch.sent_at).getTime() > 0)
})

// I: fora de ordem — cada estágio é uma coluna independente, não depende dos outros

test("I. 'read' sem 'delivered' anterior ainda produz um patch válido e independente (colunas separadas)", () => {
  const built = buildStatusPatch({ id: "wamid.AAA", status: "read", timestamp: "1755500999" })
  assert.equal(built.field, "read_at")
  assert.ok(!("delivered_at" in built.patch), "não deve tentar setar delivered_at — cada estágio é isolado")
  assert.ok(!("sent_at" in built.patch), "não deve tentar setar sent_at — cada estágio é isolado")
})

// H, J: idempotência e wamid desconhecido, via applyStatusUpdate com fetch mockado

function withFakeSupabaseEnv(fn) {
  const prevUrl = process.env.SUPABASE_URL
  const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.SUPABASE_URL = "https://fake.supabase.co"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key"
  return fn().finally(() => {
    process.env.SUPABASE_URL = prevUrl
    process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey
  })
}

test("H. idempotência: PATCH inclui filtro '<coluna>=is.null' (webhook repetido não sobrescreve)", async () => {
  await withFakeSupabaseEnv(async () => {
    const calls = []
    const originalFetch = global.fetch
    global.fetch = async (url, options) => {
      calls.push({ url: String(url), options })
      return { ok: true, status: 200, text: async () => "[]" }
    }
    try {
      await applyStatusUpdate({ id: "wamid.BBB", status: "delivered", timestamp: "1755501000" })
    } finally {
      global.fetch = originalFetch
    }
    assert.equal(calls.length, 1)
    assert.match(calls[0].url, /whatsapp_messages\?meta_message_id=eq\.wamid\.BBB&delivered_at=is\.null/)
    assert.equal(calls[0].options.method, "PATCH")
  })
})

test("J. wamid desconhecido: PostgREST não acha a linha (resposta vazia, ok) -> não lança", async () => {
  await withFakeSupabaseEnv(async () => {
    const originalFetch = global.fetch
    global.fetch = async () => ({ ok: true, status: 200, text: async () => "[]" })
    try {
      await assert.doesNotReject(() => applyStatusUpdate({ id: "wamid.DESCONHECIDO", status: "sent", timestamp: "1755501100" }))
    } finally {
      global.fetch = originalFetch
    }
  })
})

test("J2. falha de rede ao aplicar status -> não lança (best-effort, webhook nunca derruba)", async () => {
  await withFakeSupabaseEnv(async () => {
    const originalFetch = global.fetch
    global.fetch = async () => ({ ok: false, status: 500, text: async () => "erro interno" })
    try {
      await assert.doesNotReject(() => applyStatusUpdate({ id: "wamid.CCC", status: "failed", timestamp: "1755501200" }))
    } finally {
      global.fetch = originalFetch
    }
  })
})

test("tipo não reconhecido -> applyStatusUpdate não chama fetch nenhuma vez", async () => {
  await withFakeSupabaseEnv(async () => {
    let called = false
    const originalFetch = global.fetch
    global.fetch = async () => {
      called = true
      return { ok: true, status: 200, text: async () => "[]" }
    }
    try {
      await applyStatusUpdate({ id: "wamid.EEE", status: "queued" })
    } finally {
      global.fetch = originalFetch
    }
    assert.equal(called, false)
  })
})

// L: nenhum secret/PII indevido nos logs de erro

test("L. log de erro de applyStatusUpdate nunca inclui token/apikey", async () => {
  await withFakeSupabaseEnv(async () => {
    const originalFetch = global.fetch
    const originalError = console.error
    const logs = []
    console.error = (...args) => logs.push(args)
    global.fetch = async () => ({ ok: false, status: 401, text: async () => "unauthorized" })
    try {
      await applyStatusUpdate({ id: "wamid.FFF", status: "failed", timestamp: "1755501300" })
    } finally {
      global.fetch = originalFetch
      console.error = originalError
    }
    const serialized = JSON.stringify(logs)
    assert.doesNotMatch(serialized, /fake-service-role-key/)
    assert.doesNotMatch(serialized, /Bearer /)
  })
})
