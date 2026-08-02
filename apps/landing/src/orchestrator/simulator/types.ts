/**
 * Tipos do Agent Simulator (RFC-007 / RFC-008).
 *
 * O simulador nunca inventa um pipeline novo — ele só chama o
 * `SofiaOrchestrator` de verdade, turno a turno, e registra tudo que ele
 * devolve. Estes tipos descrevem só o formato do REGISTRO e do CONTRATO DE
 * ENTRADA, não o comportamento do agente (isso continua 100% em
 * `SofiaOrchestrator.ts` e módulos associados).
 */
import type {
  Action,
  ConversationEvent,
  ConversationOutcome,
  ConversationStateSnapshot,
  Decision,
  DecisionType,
  Intent,
  IntentType,
  ObjectiveId,
  ObjectiveStatus,
  Plan,
  SofiaContext,
} from "../types"
import type { ObjectivesEvaluation } from "../Objectives"

/**
 * O identificador de objetivo (RFC-008 chama isso de "ObjectiveKey" no
 * contrato de turno) — mesmo conceito de `ObjectiveId` já usado em todo o
 * Agent Core; o alias existe só para dar ao contrato de entrada o nome que a
 * RFC pediu, sem duplicar o vocabulário de fato.
 */
export type ObjectiveKey = ObjectiveId

/**
 * Contrato ESTRUTURADO de um turno de entrada do cenário (RFC-008).
 *
 * Corrige o problema da RFC-007: antes, toda mensagem preenchia
 * automaticamente o próximo objetivo pendente do roteiro, mesmo quando a
 * mensagem era uma pergunta, objeção, dúvida, saudação ou despedida — o que
 * contaminava o Context com respostas que não eram respostas de verdade.
 *
 * A partir desta RFC, um objetivo SÓ é preenchido quando `answer` está
 * explicitamente presente. Uma mensagem sem `answer` ainda é processada
 * normalmente pelo pipeline (`IntentClassifier` → `DecisionEngine` →
 * `ActionEngine`) — só não altera o Context.
 */
export interface SimulationInputTurn {
  /** Texto que a candidata "digitaria". */
  message: string
  /** Intenção que se espera que o `IntentClassifier` produza para esta mensagem — usado só para conferência (`expectedIntentMismatches`), nunca força o resultado real. */
  expectedIntent?: IntentType
  /** Só presente quando esta mensagem responde de fato a um objetivo do roteiro. */
  answer?: {
    objective: ObjectiveKey
    value: unknown
  }
  metadata?: Record<string, unknown>
}

/** Um turno completo da conversa simulada, na ordem em que o pipeline processa cada estágio. */
export interface SimulationTurn {
  turno: number
  mensagem: string
  turnoEntrada: SimulationInputTurn
  evento: ConversationEvent
  estado: ConversationStateSnapshot
  contexto: SofiaContext
  objetivos: ObjectivesEvaluation
  plano: Plan
  intent: Intent
  decision: Decision
  action: Action
  tempoMs: number
}

export interface SimulationError {
  turno: number
  mensagem: string
  erro: string
}

/**
 * Problema de integridade entre o que um turno declarou (`answer`,
 * `expectedIntent`) e o que realmente aconteceu no Context/Intent (RFC-008).
 * Nunca interrompe a simulação — só é registrado para o relatório.
 */
export interface ContextIntegrityError {
  /** `-1` para achados da auditoria de fim de execução (`OBJETIVO_SEM_ANSWER_EXPLICITO`), que não pertencem a um turno específico. */
  turno: number
  tipo: "TIPO_INCOMPATIVEL" | "INTENT_INCOMPATIVEL_COM_RESPOSTA" | "OBJETIVO_SEM_ANSWER_EXPLICITO"
  objective: ObjectiveKey
  mensagem: string
  detalhe: string
}

/** Diferença entre a `expectedIntent` declarada no turno e a Intent real produzida pelo IntentClassifier. */
export interface ExpectedIntentMismatch {
  turno: number
  mensagem: string
  esperado: IntentType
  obtido: IntentType
}

export interface SimulationResult {
  sessionId: string
  cenario?: string
  turnosEntrada: SimulationInputTurn[]
  /** Atalho de leitura — mesma ordem de `turnosEntrada`, só o texto. */
  messages: string[]
  timeline: SimulationTurn[]
  events: ConversationEvent[]
  plans: Plan[]
  intents: Intent[]
  decisions: Decision[]
  actions: Action[]
  executionTimeMs: number
  errors: SimulationError[]

  /** Como a conversa terminou — `IN_PROGRESS` se nenhum turno produziu uma Decision `FINALIZE`. */
  outcome: ConversationOutcome
  completedRequiredObjectives: ObjectiveStatus[]
  pendingRequiredObjectives: ObjectiveStatus[]
  contextIntegrityErrors: ContextIntegrityError[]
  expectedIntentMismatches: ExpectedIntentMismatch[]
}

/**
 * O que se espera de um cenário, para conferência automática (RFC-008,
 * Objetivo 9). Todos os campos são opcionais — só o que for declarado é
 * conferido.
 */
export interface ScenarioExpectation {
  outcome?: ConversationOutcome
  /** Sequência exata de intenções esperada, turno a turno. */
  intents?: IntentType[]
  /** Sequência exata de decisões esperada, turno a turno. */
  decisions?: DecisionType[]
  /** Conjunto de objetivos que devem estar concluídos ao final (ordem não importa). */
  completedObjectives?: ObjectiveKey[]
  /** Conjunto de objetivos que devem continuar pendentes ao final (ordem não importa). */
  pendingObjectives?: ObjectiveKey[]
}

export interface ScenarioDefinition {
  name: string
  turns: SimulationInputTurn[]
  expected?: ScenarioExpectation
}

/** Diferença encontrada entre o `expected` de um `ScenarioDefinition` e o `SimulationResult` real — nunca lança exceção, só é registrada. */
export interface ScenarioAssertionDiff {
  campo: "outcome" | "intents" | "decisions" | "completedObjectives" | "pendingObjectives"
  esperado: unknown
  obtido: unknown
}

/** Resultado de rodar um `ScenarioDefinition` completo — a simulação em si, mais as diferenças (se houver) contra o `expected`. */
export interface ScenarioRunResult {
  result: SimulationResult
  diffs: ScenarioAssertionDiff[]
}
