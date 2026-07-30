// Helper compartilhado para enviar eventos "Lead" ao Meta Conversions API.
//
// Usado em dois pontos:
// - `finalize-candidate`: quando o lead já nasce aprovado (IPR >= threshold).
// - `send-meta-lead-event`: quando a equipe aprova manualmente pelo Admin.
//
// O `event_id` é sempre o `lead_id`, para permitir deduplicação com o Pixel
// do navegador (que dispara o mesmo evento com o mesmo eventID quando a
// aprovação acontece na hora, na própria Landing Page).

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

/** Normaliza telefone para dígitos apenas, prefixado com código do país (assume Brasil, 55). */
function normalizePhone(telefone: string): string {
  const digits = telefone.replace(/\D/g, "")
  if (digits.startsWith("55")) return digits
  return `55${digits}`
}

export interface SendMetaLeadEventParams {
  pixelId: string
  accessToken: string
  leadId: string
  telefone: string
  fbp?: string | null
  fbc?: string | null
  clientIp?: string | null
  userAgent?: string | null
}

/**
 * Envia um evento "Lead" ao Meta Conversions API.
 * Lança em caso de falha de rede/API — o chamador deve capturar e tratar
 * como best-effort (nunca deve derrubar o fluxo principal do lead).
 */
export async function sendMetaLeadEvent({
  pixelId,
  accessToken,
  leadId,
  telefone,
  fbp,
  fbc,
  clientIp,
  userAgent,
}: SendMetaLeadEventParams): Promise<void> {
  const hashedPhone = await sha256Hex(normalizePhone(telefone))

  const userData: Record<string, unknown> = {
    ph: [hashedPhone],
  }
  if (fbp) userData.fbp = fbp
  if (fbc) userData.fbc = fbc
  if (clientIp) userData.client_ip_address = clientIp
  if (userAgent) userData.client_user_agent = userAgent

  const body = {
    data: [
      {
        event_name: "Lead",
        event_time: Math.floor(Date.now() / 1000),
        event_id: leadId,
        action_source: "website",
        user_data: userData,
      },
    ],
  }

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${accessToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  )

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`meta_conversions_api_error: ${response.status} ${detail}`)
  }
}
