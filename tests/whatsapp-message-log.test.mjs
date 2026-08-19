import test from "node:test"
import assert from "node:assert/strict"
import { extractWamid, recordOutboundWhatsappMessage } from "../supabase/functions/_shared/whatsapp-message-log.ts"

// -----------------------------------------------------------------------
// IMPLEMENTATION-INTELLIGENCE-015B — lado do ENVIO: registra o wamid
// retornado pela Graph API assim que um template outbound é aceito, pra o
// webhook (tests/whatsapp-delivery-status.test.mjs) conseguir depois
// correlacionar sent/delivered/read/failed a este envio.
// -----------------------------------------------------------------------

// A: resposta Graph API com wamid válido

test("A. extractWamid: resposta real da Graph API -> extrai messages[0].id", () => {
  const resposta = {
    messaging_product: "whatsapp",
    contacts: [{ input: "5511999999999", wa_id: "5511999999999" }],
    messages: [{ id: "wamid.HBgLNTU5MTE5OTk5OTk5FQIAERgSNzY1", message_status: "accepted" }],
  }
  assert.equal(extractWamid(resposta), "wamid.HBgLNTU5MTE5OTk5OTk5FQIAERgSNzY1")
})

test("A2. extractWamid: formato inesperado (sem prefixo wamid.) -> null, nunca lança", () => {
  assert.equal(extractWamid({ messages: [{ id: "não-é-um-wamid" }] }), null)
})

test("A3. extractWamid: messages ausente/vazio/payload nulo -> null", () => {
  assert.equal(extractWamid({}), null)
  assert.equal(extractWamid({ messages: [] }), null)
  assert.equal(extractWamid(null), null)
  assert.equal(extractWamid(undefined), null)
  assert.equal(extractWamid("string qualquer"), null)
})

// B: persistência do wamid — fake supabase client, sem rede real

function createFakeSupabase() {
  const calls = { upsert: [], insert: [] }
  return {
    calls,
    from(table) {
      return {
        upsert(payload, options) {
          calls.upsert.push({ table, payload, options })
          return Promise.resolve({ data: null, error: null })
        },
        insert(payload) {
          calls.insert.push({ table, payload })
          return Promise.resolve({ data: null, error: null })
        },
      }
    },
  }
}

test("B. wamid válido -> upsert em whatsapp_contacts + insert em whatsapp_messages com status 'accepted' e message_purpose", async () => {
  const fake = createFakeSupabase()
  await recordOutboundWhatsappMessage({
    supabase: fake,
    telefone: "11999999999",
    templateName: "ficha_aprovacao_link",
    leadId: "lead-123",
    graphApiResponse: { messages: [{ id: "wamid.XYZ" }] },
    messagePurpose: "FICHA_CANDIDATA",
  })

  assert.equal(fake.calls.upsert.length, 1)
  assert.equal(fake.calls.upsert[0].table, "whatsapp_contacts")
  assert.equal(fake.calls.upsert[0].payload.telefone, "11999999999")

  assert.equal(fake.calls.insert.length, 1)
  assert.equal(fake.calls.insert[0].table, "whatsapp_messages")
  assert.deepEqual(fake.calls.insert[0].payload, {
    meta_message_id: "wamid.XYZ",
    telefone: "11999999999",
    direction: "outbound",
    message_type: "template",
    body: "ficha_aprovacao_link",
    status: "accepted",
    lead_id: "lead-123",
    message_purpose: "FICHA_CANDIDATA",
  })
})

// IMPLEMENTATION-CRM-004B — LEMBRETE_FICHA e NOTIFICACAO_TANIA usam o mesmo
// campo, nunca inferido do templateName (dois propósitos podem reaproveitar
// o mesmo template).
test("B-purpose. messagePurpose diferente é gravado literalmente, não inferido do template", async () => {
  const fake = createFakeSupabase()
  await recordOutboundWhatsappMessage({
    supabase: fake,
    telefone: "11999999999",
    templateName: "ficha_aprovacao_link",
    leadId: "lead-123",
    graphApiResponse: { messages: [{ id: "wamid.LEMBRETE" }] },
    messagePurpose: "LEMBRETE_FICHA",
  })
  assert.equal(fake.calls.insert[0].payload.message_purpose, "LEMBRETE_FICHA")
})

test("B2. sem wamid reconhecível -> não tenta gravar nada (nem upsert, nem insert), não lança", async () => {
  const fake = createFakeSupabase()
  await assert.doesNotReject(() =>
    recordOutboundWhatsappMessage({
      supabase: fake,
      telefone: "11999999999",
      templateName: "ficha_aprovacao_link",
      leadId: "lead-123",
      graphApiResponse: {},
      messagePurpose: "FICHA_CANDIDATA",
    }),
  )
  assert.equal(fake.calls.upsert.length, 0)
  assert.equal(fake.calls.insert.length, 0)
})

test("B3. leadId ausente -> grava lead_id null, nunca undefined/lança", async () => {
  const fake = createFakeSupabase()
  await recordOutboundWhatsappMessage({
    supabase: fake,
    telefone: "11999999999",
    templateName: "ficha_aprovacao_link",
    graphApiResponse: { messages: [{ id: "wamid.SEMLEAD" }] },
    messagePurpose: "FICHA_CANDIDATA",
  })
  assert.equal(fake.calls.insert[0].payload.lead_id, null)
})

test("B4. falha no upsert/insert -> nunca lança (best-effort, não pode derrubar o envio já feito)", async () => {
  const fake = {
    from() {
      return {
        upsert: () => Promise.reject(new Error("db indisponível")),
        insert: () => Promise.reject(new Error("db indisponível")),
      }
    },
  }
  await assert.doesNotReject(() =>
    recordOutboundWhatsappMessage({
      supabase: fake,
      telefone: "11999999999",
      templateName: "ficha_aprovacao_link",
      leadId: "lead-123",
      graphApiResponse: { messages: [{ id: "wamid.FALHA" }] },
      messagePurpose: "FICHA_CANDIDATA",
    }),
  )
})
