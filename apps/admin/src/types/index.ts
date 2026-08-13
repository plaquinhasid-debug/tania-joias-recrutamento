import type { Tables } from "@tania-joias/shared"

export type Lead = Tables<"leads">
export type Answer = Tables<"answers">
export type AiAnalysis = Tables<"ai_analysis">
export type Campaign = Tables<"campaigns">
export type LogEntry = Tables<"logs">
export type Setting = Tables<"settings">
export type Profile = Tables<"profiles">
export type LeadFicha = Tables<"leads_ficha">

/** Formato do valor da linha `settings` com chave `cidades_atendidas`. */
export interface CidadesAtendidasValue {
  restringir: boolean
  lista: string[]
}

/** Formato esperado de `ai_analysis.ipr_breakdown`. */
export interface IprBreakdown {
  trabalha?: number
  experiencia_vendas?: number
  whatsapp?: number
  instagram?: number
  cidade_atendida?: number
  [key: string]: number | undefined
}

export interface LeadFiltersState {
  search: string
  status: string | "todos"
  perfilComercial: string | "todos"
  origem: string | "todos"
  cidade: string | "todos"
  dateFrom: string | null
  dateTo: string | null
}
