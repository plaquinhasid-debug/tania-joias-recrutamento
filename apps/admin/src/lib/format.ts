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

export function formatPercent(value: number, fractionDigits = 0): string {
  if (!Number.isFinite(value)) return "0%"
  return `${value.toFixed(fractionDigits)}%`
}
