/**
 * Tipos do Orquestrador da Sofia (RFC-002).
 *
 * Fase atual: o Orquestrador só OBSERVA a conversa conduzida pelo roteiro
 * fixo (`sofia-script.ts` / `useSofiaFlow.ts`) — nunca decide nem altera o
 * que é perguntado. As ações estruturadas que ele devolve nesta fase são
 * sempre informativas (`type: "observe"`); os demais tipos de ação já estão
 * modelados aqui para as próximas fases, mas ainda não são emitidos.
 */
import type { SofiaAnswers, SofiaPhase } from "@/types/sofia"

/** Identificador de cada objetivo de coleta de informação da conversa. */
export type ObjectiveId =
  | "nome"
  | "cidade"
  | "profissao"
  | "empresa"
  | "experiencia"
  | "instagram"
  | "whatsapp"
  | "motivacao"
  | "tempo"

export interface Objective {
  id: ObjectiveId
  label: string
  /** Decide, a partir das respostas já coletadas, se este objetivo está concluído. */
  isComplete: (answers: SofiaAnswers) => boolean
}

export interface ObjectiveStatus {
  id: ObjectiveId
  label: string
  complete: boolean
}

/** Dúvida ou objeção detectada na conversa — estrutura preparada, ainda não populada nesta fase. */
export interface OpenConcern {
  id: string
  descricao: string
  detectadoEm: string
}

export type ConversationStatus = "em_andamento" | "concluida" | "abandonada"

/** Snapshot imutável do estado da conversa num dado momento. */
export interface ConversationStateSnapshot {
  sessionId: string
  fase: SofiaPhase
  ultimaMensagem: string | null
  ultimaPergunta: string | null
  objetivosConcluidos: ObjectiveStatus[]
  objetivosPendentes: ObjectiveStatus[]
  duvidasAbertas: OpenConcern[]
  objecoes: OpenConcern[]
  status: ConversationStatus
  atualizadoEm: string
}

/** Diagnóstico do Planner — nesta fase é só informativo, nunca escolhe a próxima pergunta. */
export interface PlannerDiagnosis {
  objetivosConcluidos: ObjectiveStatus[]
  objetivosPendentes: ObjectiveStatus[]
  /** 0-100, proporção de objetivos concluídos. */
  progresso: number
  prontoParaFinalizar: boolean
}

/**
 * Ação estruturada devolvida pelo Orquestrador para a interface. Nesta fase
 * só `"observe"` é de fato emitido — os demais valores já existem no tipo
 * para as próximas fases (pedir resposta ao modelo, pedir uma ferramenta,
 * escolher a próxima pergunta), sem uso real ainda.
 */
export type OrchestratorActionType = "observe" | "request_model_response" | "request_tool" | "ask_next"

export interface OrchestratorAction {
  type: OrchestratorActionType
  descricao: string
  payload?: unknown
}

/** Evento que a interface (`useSofiaFlow`) reporta ao Orquestrador. */
export type ConversationEvent =
  | { type: "intro_started" }
  | { type: "bot_message"; texto: string; origem: "roteiro" | "ia" }
  | { type: "user_answer"; campo: string; valor: unknown }
  | { type: "conversation_ended"; status: ConversationStatus }

/** Contexto adicional necessário para reconstruir o estado a cada evento. */
export interface ObserveContext {
  fase: SofiaPhase
  answers: SofiaAnswers
}
