/**
 * Tipos do Agent Simulator (RFC-007).
 *
 * O simulador nunca inventa um pipeline novo — ele só chama o
 * `SofiaOrchestrator` de verdade, turno a turno, e registra tudo que ele
 * devolve. Estes tipos descrevem só o formato do REGISTRO, não o
 * comportamento do agente (isso continua 100% em `SofiaOrchestrator.ts` e
 * módulos associados).
 */
import type {
  Action,
  ConversationEvent,
  ConversationStateSnapshot,
  Decision,
  Intent,
  Plan,
  SofiaContext,
} from "../types"
import type { ObjectivesEvaluation } from "../Objectives"

/** Um turno completo da conversa simulada, na ordem em que o pipeline processa cada estágio. */
export interface SimulationTurn {
  turno: number
  mensagem: string
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

export interface SimulationResult {
  sessionId: string
  cenario?: string
  messages: string[]
  timeline: SimulationTurn[]
  events: ConversationEvent[]
  plans: Plan[]
  intents: Intent[]
  decisions: Decision[]
  actions: Action[]
  executionTimeMs: number
  errors: SimulationError[]
}
