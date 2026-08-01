/**
 * Tipos do Orquestrador da Sofia (RFC-002 / RFC-003).
 *
 * Fase atual: o Orquestrador só OBSERVA a conversa conduzida pelo roteiro
 * fixo (`sofia-script.ts` / `useSofiaFlow.ts`) — nunca decide nem altera o
 * que é perguntado. O Plano e a Ação produzidos aqui são sempre
 * informativos; a interface nunca os consome para decidir nada.
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
  /** Decide, a partir do Contexto atual, se este objetivo está concluído. */
  isComplete: (context: SofiaContext) => boolean
}

export interface ObjectiveStatus {
  id: ObjectiveId
  label: string
  complete: boolean
}

/** Dúvida ou objeção detectada na conversa — estrutura preparada; a detecção em si ainda não está implementada. */
export interface OpenConcern {
  id: string
  descricao: string
  detectadoEm: string
}

export type ConversationStatus = "em_andamento" | "concluida" | "abandonada"

/**
 * Estado TÉCNICO da conversa — fase da máquina de estados, última
 * mensagem/pergunta, status. Não contém nenhuma informação sobre a
 * candidata (isso vive em `SofiaContext`).
 */
export interface ConversationStateSnapshot {
  sessionId: string
  fase: SofiaPhase
  ultimaMensagem: string | null
  ultimaPergunta: string | null
  status: ConversationStatus
  atualizadoEm: string
}

/**
 * Tudo que a Sofia sabe sobre a candidata até agora — o "conhecimento de
 * domínio" da conversa, separado do estado técnico. Cresce incrementalmente
 * conforme as respostas chegam.
 */
export interface SofiaContext {
  nome?: string
  cidade?: string
  profissao?: string
  empresaAtual?: string
  experienciaVendas?: boolean
  possuiInstagram?: boolean
  instagram?: string | null
  whatsapp?: boolean
  motivacao?: string
  tempoDisponivel?: string
  duvidasAbertas: OpenConcern[]
  objecoes: OpenConcern[]
}

/**
 * Plano produzido pelo Planner a partir do estado/contexto/objetivos
 * atuais. Nesta fase é inteiramente determinístico (sem IA) e nunca é
 * executado — só diagnostica e prioriza.
 */
export interface Plan {
  proximoObjetivo: ObjectiveStatus | null
  objetivosFuturos: ObjectiveStatus[]
  itensPendentes: ObjectiveStatus[]
  objetivosConcluidos: ObjectiveStatus[]
  motivoPrioridade: string
  observacoes: string[]
  /** 0-100, proporção de objetivos concluídos. */
  progresso: number
  prontoParaFinalizar: boolean
}

/**
 * Ação estruturada devolvida pelo ActionEngine para o Orchestrator. Nesta
 * fase nenhuma ação altera o comportamento da interface — o roteiro fixo
 * continua sendo o único responsável por decidir o que é perguntado.
 */
export type ActionType = "PERGUNTAR" | "RESPONDER_DUVIDA" | "CONTINUAR" | "FINALIZAR" | "AGUARDAR" | "OBSERVAR"

export interface Action {
  type: ActionType
  reason: string
  target?: ObjectiveId
}

/** Evento que a interface (`useSofiaFlow`) reporta ao Orquestrador a cada turno. */
export type ConversationEvent =
  | { type: "intro_started" }
  | { type: "bot_message"; texto: string; origem: "roteiro" | "ia" }
  | { type: "user_answer"; campo: string; valor: unknown }
  | { type: "conversation_ended"; status: ConversationStatus }

/** Entrada adicional que a interface fornece a cada turno para reconstruir estado/contexto. */
export interface TurnInput {
  fase: SofiaPhase
  answers: SofiaAnswers
}
