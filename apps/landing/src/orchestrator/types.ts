/**
 * Tipos do Orquestrador da Sofia (RFC-002 / RFC-003 / RFC-005).
 *
 * Fase atual: o Orquestrador só OBSERVA a conversa conduzida pelo roteiro
 * fixo (`sofia-script.ts` / `useSofiaFlow.ts`) — nunca decide nem altera o
 * que é perguntado. Intent, Plano, Decision e Ação produzidos aqui são
 * sempre informativos; a interface nunca os consome para decidir nada.
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
  /**
   * Se a conversa só pode terminar como `COMPLETED` quando este objetivo
   * estiver concluído (RFC-008). Hoje todos os objetivos são `required:
   * true` — o campo só prepara a arquitetura para objetivos opcionais no
   * futuro, nenhum objetivo mudou de obrigatório para opcional nesta fase.
   */
  required: boolean
  /** Espelha a ordem de `OBJECTIVES` (1 = primeiro) — ver nota em `Objectives.ts`. */
  priority: number
}

export interface ObjectiveStatus {
  id: ObjectiveId
  label: string
  complete: boolean
  required: boolean
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
 * Intenção estruturada devolvida pelo IntentClassifier (RFC-005) — nunca
 * texto, nunca resposta. Totalmente determinística nesta fase (regras
 * simples, sem IA).
 */
export type IntentType =
  | "GREETING"
  | "ANSWER"
  | "QUESTION"
  | "OBJECTION"
  | "DOUBT"
  | "SMALL_TALK"
  | "CONFIRMATION"
  | "NEGATION"
  | "END_CONVERSATION"
  | "UNKNOWN"

export interface Intent {
  type: IntentType
  /** 0-1. */
  confidence: number
  reason: string
}

/**
 * Decisão estruturada devolvida pelo DecisionEngine (RFC-005) — o que
 * deveria acontecer a seguir, nunca como fazer isso. Nesta fase não é
 * executada por ninguém; o roteiro fixo continua no comando de verdade.
 */
export type DecisionType =
  | "CONTINUE_FLOW"
  | "ANSWER_WITH_TOOL"
  | "CALL_AI"
  | "REGISTER_OBJECTION"
  | "REGISTER_DOUBT"
  | "FINALIZE"
  | "WAIT"
  | "IGNORE"

/**
 * Como a conversa terminou (RFC-008) — só existe quando `Decision.type` é
 * `FINALIZE`. Representa exclusivamente o desfecho da CONVERSA (a
 * entrevista foi concluída? abandonada?), nunca o resultado de negócio da
 * candidatura.
 *
 * IMPORTANTE: nunca substitui nem se mistura com o motor de regras
 * determinístico (IPR / status do lead / aprovação / reprovação / análise
 * manual) — isso continua sendo responsabilidade exclusiva das Edge
 * Functions server-side (`finalize-candidate`), fora do Agent Core.
 * `REJECTED_BY_RULE` e `MANUAL_REVIEW` estão previstos aqui só para o dia em
 * que o Agent Core passar a CONSULTAR esse motor (não implementado nesta
 * RFC) — nenhuma lógica atual produz esses dois valores ainda.
 */
export type ConversationOutcome =
  | "IN_PROGRESS"
  | "COMPLETED"
  | "ABANDONED"
  | "REJECTED_BY_RULE"
  | "MANUAL_REVIEW"
  | "FAILED"

/** Códigos de erro estruturado devolvidos quando o pipeline do Orchestrator falha internamente (RFC-008). */
export type OrchestratorErrorCode = "ORCHESTRATOR_PIPELINE_ERROR"

export interface Decision {
  type: DecisionType
  reason: string
  /** 0-1 — herdada da confiança do Intent que originou esta decisão. */
  confidence: number
  /** Só preenchido quando `type === "FINALIZE"`. */
  outcome?: ConversationOutcome
  metadata?: Record<string, unknown>
}

/**
 * Ação estruturada devolvida pelo ActionEngine (RFC-003 → RFC-005). A
 * partir da RFC-005 o ActionEngine deixou de decidir (isso é do
 * DecisionEngine) e passou a só EXECUTAR uma Decision — por isso `Action`
 * reaproveita o mesmo vocabulário fechado de `DecisionType` em vez de ter um
 * vocabulário próprio; o único valor concreto que o ActionEngine resolve é o
 * `target` (lido do Plano), quando aplicável. Nenhuma ação altera o
 * comportamento da interface — o roteiro fixo continua sendo o único
 * responsável por decidir o que é perguntado.
 */
export interface Action {
  type: DecisionType
  reason: string
  target?: ObjectiveId
  /** Repassado da Decision de origem quando `type === "FINALIZE"` (RFC-008). */
  outcome?: ConversationOutcome
  metadata?: Record<string, unknown>
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
