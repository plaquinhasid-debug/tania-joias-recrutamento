/**
 * FEATURE-005, Parte 3 — contratos da futura "condução natural" (shadow).
 *
 * Nada aqui é chamado pelo fluxo real ainda. Ver `NaturalConversationEngine.ts`
 * pro módulo que consome estes tipos.
 */
import type { CandidateMessageKind } from "../classifyCandidateMessage"

export type ReactionStrategy = "NONE" | "DETERMINISTIC" | "AI"

export interface NaturalReaction {
  shouldReact: boolean
  strategy: ReactionStrategy
  acknowledgment?: string
  transition?: string
  nextQuestion?: string
  metadata?: Record<string, unknown>
}

/**
 * Entrada do Engine — os 5 dados pedidos originalmente na Parte 3 (pergunta
 * atual, campo atual, resposta da candidata, classificação, contexto
 * conhecido) mais um campo novo opcional da Parte 2 (Objetivo 7):
 * `canFillCurrentField`, vindo do classificador contextual
 * (`classifyCandidateMessageContextual.ts`). Quando ausente (quem chama só
 * tem o `CandidateMessageKind` simples da Parte 1), o Engine cai de volta
 * pro comportamento antigo (`classification === "ANSWER"`) — mudança 100%
 * aditiva, os testes da Parte 3 continuam passando sem alteração.
 */
export interface ReactionRequest {
  fieldKey: string
  currentQuestion: string
  candidateAnswer: string
  classification: CandidateMessageKind
  knownContext: Record<string, unknown>
  canFillCurrentField?: boolean
}

export interface ReactionResponse {
  reaction: NaturalReaction
}
