// Helper compartilhado para enviar a mensagem de aprovação via WhatsApp
// Cloud API (API oficial da Meta).
//
// Usado em dois pontos:
// - `finalize-candidate`: quando o lead já nasce aprovado (IPR >= threshold).
// - `send-whatsapp-approval`: quando a equipe aprova manualmente pelo Admin.
//
// Reimplementa a normalização de telefone aqui (em vez de importar de
// `apps/admin/src/lib/format.ts`) porque Edge Functions (Deno) não importam
// código de dentro de `apps/admin`.

/** Normaliza telefone para dígitos apenas, prefixado com código do país (assume Brasil, 55). */
export function normalizeBrazilPhone(telefone: string): string {
  const digits = telefone.replace(/\D/g, "")
  if (digits.startsWith("55")) return digits
  return `55${digits}`
}

export interface SendWhatsappApprovalTemplateParams {
  token: string
  phoneNumberId: string
  templateName: string
  telefone: string
  nome: string
}

/**
 * Envia o template de aprovação aprovado pela Meta via WhatsApp Cloud API.
 * Lança em caso de falha de rede/API — o chamador deve capturar e tratar
 * como best-effort (nunca deve derrubar o fluxo principal do lead).
 */
export async function sendWhatsappApprovalTemplate({
  token,
  phoneNumberId,
  templateName,
  telefone,
  nome,
}: SendWhatsappApprovalTemplateParams): Promise<void> {
  const to = normalizeBrazilPhone(telefone)
  const primeiroNome = nome.trim().split(/\s+/)[0] ?? nome

  const body = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: "pt_BR" },
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: primeiroNome }],
        },
      ],
    },
  }

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    },
  )

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`whatsapp_cloud_api_error: ${response.status} ${detail}`)
  }
}

export interface SendWhatsappFichaTemplateParams {
  token: string
  phoneNumberId: string
  templateName: string
  telefone: string
  nome: string
  fichaToken: string
}

/**
 * Envia o template `ficha_aprovacao_link` (aprovado pela Meta em 14/08/2026)
 * via WhatsApp Cloud API. Corpo tem 1 variável (primeiro nome); o botão
 * "Preencher Ficha" é uma URL dinâmica cuja parte fixa
 * (`https://tania-joias-landing.vercel.app/ficha/`) já está no modelo — só o
 * token entra como parâmetro do botão, nunca a URL inteira.
 */
export async function sendWhatsappFichaTemplate({
  token,
  phoneNumberId,
  templateName,
  telefone,
  nome,
  fichaToken,
}: SendWhatsappFichaTemplateParams): Promise<unknown> {
  const to = normalizeBrazilPhone(telefone)
  const primeiroNome = nome.trim().split(/\s+/)[0] ?? nome

  const body = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: "pt_BR" },
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: primeiroNome }],
        },
        {
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: fichaToken }],
        },
      ],
    },
  }

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    },
  )

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`whatsapp_cloud_api_error: ${response.status} ${detail}`)
  }

  return response.json()
}

export interface SendWhatsappTaniaNotificationTemplateParams {
  token: string
  phoneNumberId: string
  templateName: string
  telefone: string
  nome: string
  cidade: string
  leadId: string
}

/**
 * Envia o template `nova_ficha_tania_utility` (estrutura confirmada no Meta
 * Business Manager em 20/08/2026) via WhatsApp Cloud API, avisando a Tania
 * que uma candidata terminou a Ficha e está pronta para análise. Corpo tem 2
 * variáveis (nome, cidade); o botão "Analisar candidata" é uma URL dinâmica
 * cuja parte fixa (`https://tania-joias-recrutamento.vercel.app/crm?lead=`)
 * já está no modelo — só o `lead.id` entra como parâmetro do botão, nunca a
 * URL inteira (mesmo padrão de `sendWhatsappFichaTemplate` acima).
 */
export async function sendWhatsappTaniaNotificationTemplate({
  token,
  phoneNumberId,
  templateName,
  telefone,
  nome,
  cidade,
  leadId,
}: SendWhatsappTaniaNotificationTemplateParams): Promise<unknown> {
  const to = normalizeBrazilPhone(telefone)

  const body = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: "pt_BR" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: nome },
            { type: "text", text: cidade },
          ],
        },
        {
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: leadId }],
        },
      ],
    },
  }

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    },
  )

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`whatsapp_cloud_api_error: ${response.status} ${detail}`)
  }

  return response.json()
}

export interface SendWhatsappFreeTextParams {
  token: string
  phoneNumberId: string
  telefone: string
  texto: string
}

/**
 * Envia texto livre (sem template) via WhatsApp Cloud API. Só funciona
 * dentro da janela de 24h de atendimento — exige que o destinatário tenha
 * mandado uma mensagem pro número oficial recentemente. Fora dessa janela
 * a Meta rejeita e esta função lança; o chamador deve tratar como
 * best-effort e ter um caminho manual de reserva.
 */
export async function sendWhatsappFreeText({
  token,
  phoneNumberId,
  telefone,
  texto,
}: SendWhatsappFreeTextParams): Promise<void> {
  const to = normalizeBrazilPhone(telefone)

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { preview_url: false, body: texto },
      }),
    },
  )

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`whatsapp_cloud_api_error: ${response.status} ${detail}`)
  }
}
