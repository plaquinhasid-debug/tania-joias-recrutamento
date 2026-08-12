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
