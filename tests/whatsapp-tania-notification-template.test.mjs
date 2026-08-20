import test from "node:test"
import assert from "node:assert/strict"

// -----------------------------------------------------------------------
// IMPLEMENTATION-CRM-004C — payload exato enviado à Graph API pelo template
// `nova_ficha_tania_utility` (estrutura confirmada no Meta Business Manager
// em 20/08/2026: corpo com 2 variáveis nome/cidade, botão URL dinâmica com
// 1 parâmetro = lead.id). Nenhuma chamada real à Meta — `fetch` é mockado.
// -----------------------------------------------------------------------

const { sendWhatsappTaniaNotificationTemplate } = await import(
  "../supabase/functions/_shared/whatsapp-cloud-api.ts"
)

test("A. monta o payload com body [nome, cidade] e botão [lead.id], na ordem certa", async () => {
  const originalFetch = global.fetch
  let capturedUrl
  let capturedOptions
  global.fetch = async (url, options) => {
    capturedUrl = url
    capturedOptions = options
    return {
      ok: true,
      status: 200,
      json: async () => ({
        messaging_product: "whatsapp",
        contacts: [{ input: "5511946370390", wa_id: "5511946370390" }],
        messages: [{ id: "wamid.TESTE123", message_status: "accepted" }],
      }),
    }
  }

  try {
    const resposta = await sendWhatsappTaniaNotificationTemplate({
      token: "fake-token-nunca-real",
      phoneNumberId: "1170931569447196",
      templateName: "nova_ficha_tania_utility",
      telefone: "5511946370390",
      nome: "Maria Silva",
      cidade: "Guarulhos",
      leadId: "12345678-1234-1234-1234-123456789012",
    })

    assert.equal(capturedUrl, "https://graph.facebook.com/v21.0/1170931569447196/messages")
    assert.equal(capturedOptions.method, "POST")
    assert.equal(capturedOptions.headers.Authorization, "Bearer fake-token-nunca-real")

    const body = JSON.parse(capturedOptions.body)
    assert.equal(body.messaging_product, "whatsapp")
    assert.equal(body.to, "5511946370390")
    assert.equal(body.type, "template")
    assert.equal(body.template.name, "nova_ficha_tania_utility")
    assert.equal(body.template.language.code, "pt_BR")

    assert.equal(body.template.components.length, 2)

    const [bodyComponent, buttonComponent] = body.template.components
    assert.equal(bodyComponent.type, "body")
    assert.deepEqual(bodyComponent.parameters, [
      { type: "text", text: "Maria Silva" },
      { type: "text", text: "Guarulhos" },
    ])

    assert.equal(buttonComponent.type, "button")
    assert.equal(buttonComponent.sub_type, "url")
    assert.equal(buttonComponent.index, "0")
    assert.deepEqual(buttonComponent.parameters, [
      { type: "text", text: "12345678-1234-1234-1234-123456789012" },
    ])

    // Devolve o JSON da Graph API (não void) — necessário pro chamador
    // extrair o wamid via `recordOutboundWhatsappMessage`.
    assert.equal(resposta.messages[0].id, "wamid.TESTE123")
  } finally {
    global.fetch = originalFetch
  }
})

test("B. telefone é normalizado pro padrão BR (adiciona 55 se faltar)", async () => {
  const originalFetch = global.fetch
  let capturedOptions
  global.fetch = async (_url, options) => {
    capturedOptions = options
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: "wamid.X" }] }) }
  }

  try {
    await sendWhatsappTaniaNotificationTemplate({
      token: "t",
      phoneNumberId: "p",
      templateName: "nova_ficha_tania_utility",
      telefone: "11946370390",
      nome: "Maria",
      cidade: "Guarulhos",
      leadId: "id-1",
    })
    const body = JSON.parse(capturedOptions.body)
    assert.equal(body.to, "5511946370390")
  } finally {
    global.fetch = originalFetch
  }
})

test("C. Graph API rejeita (ex.: template incompatível) -> lança, nunca engole o erro", async () => {
  const originalFetch = global.fetch
  global.fetch = async () => ({
    ok: false,
    status: 400,
    text: async () => '{"error":{"message":"Parameter format does not match template"}}',
  })

  try {
    await assert.rejects(
      () =>
        sendWhatsappTaniaNotificationTemplate({
          token: "t",
          phoneNumberId: "p",
          templateName: "nova_ficha_tania_utility",
          telefone: "5511946370390",
          nome: "Maria",
          cidade: "Guarulhos",
          leadId: "id-1",
        }),
      /whatsapp_cloud_api_error: 400/,
    )
  } finally {
    global.fetch = originalFetch
  }
})
