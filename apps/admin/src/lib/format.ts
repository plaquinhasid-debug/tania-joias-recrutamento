import { format, formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"

export function formatDate(value: string | null | undefined, pattern = "dd/MM/yyyy"): string {
  if (!value) return "—"
  try {
    return format(new Date(value), pattern, { locale: ptBR })
  } catch {
    return "—"
  }
}

export function formatDateTime(value: string | null | undefined): string {
  return formatDate(value, "dd/MM/yyyy 'às' HH:mm")
}

export function formatRelative(value: string | null | undefined): string {
  if (!value) return "—"
  try {
    return formatDistanceToNow(new Date(value), { locale: ptBR, addSuffix: true })
  } catch {
    return "—"
  }
}

/** Mantém só os dígitos de um telefone, útil para montar o link wa.me. */
export function onlyDigits(value: string | null | undefined): string {
  if (!value) return ""
  return value.replace(/\D/g, "")
}

/** Monta o link do WhatsApp a partir de um telefone brasileiro em formato livre. */
export function whatsappLink(telefone: string | null | undefined): string | null {
  const digits = onlyDigits(telefone)
  if (!digits) return null
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`
  return `https://wa.me/${withCountry}`
}

export function formatPhone(telefone: string | null | undefined): string {
  const digits = onlyDigits(telefone)
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return telefone ?? "—"
}

// IMPLEMENTATION-EMBAIXADORAS-E2.3-E — `formatPhone` (acima) não trata o
// prefixo "55" que `embaixadoras.telefone_normalizado` sempre carrega
// (formato canônico de packages/shared/src/phone.ts: "55" + DDD + local, 12
// ou 13 dígitos) — passado direto, cairia no fallback e devolveria o número
// cru sem formatação. Função nova e pequena, só de apresentação, que retira
// o "55" e delega pro `formatPhone` já existente (não duplica a lógica de
// "(DD) XXXXX-XXXX"). NÃO mexe em `packages/shared/src/phone.ts` — a
// normalização oficial pra persistência continua intocada; isto é só leitura.
export function formatTelefoneNormalizado(telefoneNormalizado: string | null | undefined): string {
  const digits = onlyDigits(telefoneNormalizado)
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return formatPhone(digits.slice(2))
  }
  // `??` só cobre null/undefined — uma string vazia ("") precisa do mesmo
  // fallback, senão a célula ficaria em branco em vez de mostrar "—".
  return telefoneNormalizado ? telefoneNormalizado : "—"
}

/** Apresenta um único @ inicial, sem alterar o valor persistido. */
export function formatInstagram(value: string | null | undefined): string {
  const username = (value ?? "").trim().replace(/^@+/, "")
  return username ? `@${username}` : "—"
}

export function formatPercent(value: number, fractionDigits = 0): string {
  if (!Number.isFinite(value)) return "0%"
  return `${value.toFixed(fractionDigits)}%`
}

export function whatsappLinkWithMessage(
  telefone: string | null | undefined,
  message: string,
): string | null {
  const link = whatsappLink(telefone)
  if (!link) return null
  const encoded = encodeURIComponent(message)
  return `${link}?text=${encoded}`
}

export function googleMapsUrl(endereco: {
  endereco_rua: string | null
  endereco_numero: string | null
  endereco_bairro: string | null
  endereco_cidade: string | null
  endereco_cep: string | null
}): string | null {
  const partes = [
    endereco.endereco_rua,
    endereco.endereco_numero,
    endereco.endereco_bairro,
    endereco.endereco_cidade,
    endereco.endereco_cep,
  ].filter(Boolean)
  if (partes.length === 0) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(partes.join(", "))}`
}
