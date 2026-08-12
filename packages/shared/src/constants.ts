import type { Enums } from "./database.types"

export type LeadStatus = Enums<"lead_status">
export type PerfilComercial = Enums<"perfil_comercial_enum">
export type Recomendacao = Enums<"recomendacao_enum">
export type EventoFunil = Enums<"evento_funil">
export type EtapaPosAprovacao = Enums<"etapa_pos_aprovacao_enum">

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

// Etapas do funil DEPOIS de uma lead ser aprovada (Kanban do Admin). Só têm
// sentido quando `status = 'aprovada'` — nunca participam de
// calcularIpr/decidirStatus/classificarPerfil nem do evento Meta Lead (ver
// supabase/functions/finalize-candidate/index.ts). Controle manual da
// equipe, adicional ao `status` que já existia.
export const ETAPA_POS_APROVACAO_LABEL: Record<EtapaPosAprovacao, string> = {
  contatada: "Contatada",
  confirmada: "Confirmada",
  ativa: "Ativa",
  desistiu: "Desistiu",
}

export const ETAPA_POS_APROVACAO_COLOR: Record<EtapaPosAprovacao, string> = {
  contatada: "#97C459",
  confirmada: "#639922",
  ativa: "#3B6D11",
  desistiu: "#D85A30",
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

// Kanban do Admin — pipeline único que vai de "Novo Lead" até "Ativa",
// combinando as 4 colunas originais (ligadas a `lead_status`) com as 4 novas
// etapas pós-aprovação (ligadas a `etapa_pos_aprovacao`). `key` é usado como
// id da coluna pro drag-and-drop; `pipelineColumnKeyForLead`/
// `patchForPipelineColumn` fazem a ponte entre esse id e os dois campos
// reais do banco.
export type PipelineColumnKey =
  | "novo"
  | "em_analise"
  | "aprovada"
  | "contatada"
  | "confirmada"
  | "ativa"
  | "desistiu"
  | "reprovada"

export interface PipelineColumn {
  key: PipelineColumnKey
  label: string
  color: string
}

export const PIPELINE_COLUMNS: PipelineColumn[] = [
  { key: "novo", label: LEAD_STATUS_LABEL.novo, color: LEAD_STATUS_COLOR.novo },
  { key: "em_analise", label: LEAD_STATUS_LABEL.em_analise, color: LEAD_STATUS_COLOR.em_analise },
  { key: "aprovada", label: LEAD_STATUS_LABEL.aprovada, color: LEAD_STATUS_COLOR.aprovada },
  { key: "contatada", label: ETAPA_POS_APROVACAO_LABEL.contatada, color: ETAPA_POS_APROVACAO_COLOR.contatada },
  { key: "confirmada", label: ETAPA_POS_APROVACAO_LABEL.confirmada, color: ETAPA_POS_APROVACAO_COLOR.confirmada },
  { key: "ativa", label: ETAPA_POS_APROVACAO_LABEL.ativa, color: ETAPA_POS_APROVACAO_COLOR.ativa },
  { key: "desistiu", label: ETAPA_POS_APROVACAO_LABEL.desistiu, color: ETAPA_POS_APROVACAO_COLOR.desistiu },
  { key: "reprovada", label: LEAD_STATUS_LABEL.reprovada, color: LEAD_STATUS_COLOR.reprovada },
]

interface LeadForPipeline {
  status: LeadStatus
  etapa_pos_aprovacao: EtapaPosAprovacao | null
}

/** Em qual coluna do Kanban uma lead cai, combinando `status` + `etapa_pos_aprovacao`. */
export function pipelineColumnKeyForLead(lead: LeadForPipeline): PipelineColumnKey {
  if (lead.status === "aprovada") {
    return lead.etapa_pos_aprovacao ?? "aprovada"
  }
  return lead.status
}

/** O que gravar no banco quando uma lead é arrastada para a coluna `key`. */
export function patchForPipelineColumn(
  key: PipelineColumnKey,
): { status: LeadStatus; etapa_pos_aprovacao: EtapaPosAprovacao | null } {
  switch (key) {
    case "contatada":
    case "confirmada":
    case "ativa":
    case "desistiu":
      return { status: "aprovada", etapa_pos_aprovacao: key }
    case "aprovada":
      return { status: "aprovada", etapa_pos_aprovacao: null }
    default:
      return { status: key, etapa_pos_aprovacao: null }
  }
}

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
