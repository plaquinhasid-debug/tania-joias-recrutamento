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

// Campos consultivos da análise expandida da Sofia (ver `ai_analysis` /
// `supabase/functions/_shared/ai-analysis.ts`). Colunas `text` com CHECK
// constraint no banco, não enums do Postgres — por isso os tipos e labels
// vivem aqui como união literal, no mesmo espírito de PERFIL_COMERCIAL_LABEL.
export type PerfilSugeridoIa = "baixo" | "medio" | "alto" | "excelente"
export type PotencialEmpreendedor = "baixo" | "medio" | "alto" | "muito_alto"
export type ProximaAcao = "ligar_imediatamente" | "enviar_whatsapp" | "analise_manual" | "aguardar"
export type Sentimento = "muito_motivada" | "motivada" | "neutra" | "insegura" | "desmotivada"
export type MotivacaoPrincipal =
  | "renda_extra"
  | "independencia_financeira"
  | "sonho_pessoal"
  | "flexibilidade"
  | "empreender"
  | "outro"

export const PERFIL_SUGERIDO_IA_LABEL: Record<PerfilSugeridoIa, string> = {
  baixo: "Baixo",
  medio: "Médio",
  alto: "Alto",
  excelente: "Excelente",
}

export const POTENCIAL_EMPREENDEDOR_LABEL: Record<PotencialEmpreendedor, string> = {
  baixo: "Baixo",
  medio: "Médio",
  alto: "Alto",
  muito_alto: "Muito alto",
}

export const PROXIMA_ACAO_LABEL: Record<ProximaAcao, string> = {
  ligar_imediatamente: "Ligar imediatamente",
  enviar_whatsapp: "Enviar WhatsApp",
  analise_manual: "Análise manual",
  aguardar: "Aguardar",
}

export const SENTIMENTO_LABEL: Record<Sentimento, string> = {
  muito_motivada: "Muito motivada",
  motivada: "Motivada",
  neutra: "Neutra",
  insegura: "Insegura",
  desmotivada: "Desmotivada",
}

export const MOTIVACAO_PRINCIPAL_LABEL: Record<MotivacaoPrincipal, string> = {
  renda_extra: "Renda extra",
  independencia_financeira: "Independência financeira",
  sonho_pessoal: "Sonho pessoal",
  flexibilidade: "Flexibilidade",
  empreender: "Empreender",
  outro: "Outro",
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
