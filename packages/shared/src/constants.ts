import type { Enums } from "./database.types"

export type LeadStatus = Enums<"lead_status">
export type PerfilComercial = Enums<"perfil_comercial_enum">
export type Recomendacao = Enums<"recomendacao_enum">
export type EventoFunil = Enums<"evento_funil">

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  novo: "Novo Lead",
  em_analise: "Em Análise",
  aprovada: "Aprovada",
  reprovada: "Reprovada",
}

export const LEAD_STATUS_COLOR: Record<LeadStatus, string> = {
  novo: "#6B6B6B",
  em_analise: "#C6A664",
  aprovada: "#1F8A4C",
  reprovada: "#B3261E",
}

export const PERFIL_COMERCIAL_LABEL: Record<PerfilComercial, string> = {
  baixo: "Baixo",
  medio: "Médio",
  alto: "Alto",
}

export const KANBAN_COLUMNS: { status: LeadStatus; label: string }[] = [
  { status: "novo", label: "Novo Lead" },
  { status: "em_analise", label: "Em Análise" },
  { status: "aprovada", label: "Aprovada" },
  { status: "reprovada", label: "Reprovada" },
]

export const RADAR_FUNIL_STEPS: { evento: EventoFunil; label: string }[] = [
  { evento: "ad_click", label: "Clicaram no anúncio" },
  { evento: "landing_view", label: "Abriram a Landing Page" },
  { evento: "chat_iniciado", label: "Iniciaram a conversa" },
  { evento: "respondeu_trabalha_sim", label: "Responderam que trabalham" },
  { evento: "aprovada", label: "Foram aprovadas" },
]

/**
 * Pesos fixos do IPR (Índice de Potencial da Revendedora).
 * Fonte da verdade real é a Edge Function `finalize-candidate` (roda server-side
 * com service role). Esta cópia serve só para exibir o breakdown no admin.
 */
export const IPR_PESOS = {
  trabalha: 50,
  experiencia_vendas: 20,
  whatsapp: 10,
  instagram: 10,
  cidade_atendida: 10,
} as const

export const IPR_THRESHOLDS = {
  aprovar: 80,
  analiseMin: 60,
} as const
