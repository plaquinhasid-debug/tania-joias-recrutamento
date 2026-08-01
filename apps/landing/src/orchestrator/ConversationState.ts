/**
 * ConversationState (RFC-002, fase 1).
 *
 * Responsável só por representar o estado atual da conversa como um
 * snapshot imutável — não guarda estado próprio, não decide nada. Cada
 * chamada de `buildConversationState` recalcula os objetivos concluídos e
 * pendentes a partir das respostas atuais.
 */
import type { SofiaAnswers, SofiaPhase } from "@/types/sofia"
import { evaluateObjectives } from "./Objectives"
import type { ConversationStateSnapshot, ConversationStatus } from "./types"

export interface BuildConversationStateParams {
  sessionId: string
  fase: SofiaPhase
  ultimaMensagem: string | null
  ultimaPergunta: string | null
  answers: SofiaAnswers
  status: ConversationStatus
}

export function buildConversationState(params: BuildConversationStateParams): ConversationStateSnapshot {
  const { concluidos, pendentes } = evaluateObjectives(params.answers)

  return {
    sessionId: params.sessionId,
    fase: params.fase,
    ultimaMensagem: params.ultimaMensagem,
    ultimaPergunta: params.ultimaPergunta,
    objetivosConcluidos: concluidos,
    objetivosPendentes: pendentes,
    // Preparado para crescer — detecção real de dúvidas/objeções é um passo futuro (ver relatório da RFC-002).
    duvidasAbertas: [],
    objecoes: [],
    status: params.status,
    atualizadoEm: new Date().toISOString(),
  }
}
