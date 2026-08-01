/**
 * ConversationState (RFC-002 / RFC-003).
 *
 * Representa só o estado TÉCNICO da conversa — fase, última mensagem/
 * pergunta, status. Não contém nenhuma informação sobre a candidata (isso
 * vive em `Context.ts` a partir da RFC-003) e não decide nada.
 */
import type { SofiaPhase } from "@/types/sofia"
import type { ConversationStateSnapshot, ConversationStatus } from "./types"

export interface BuildConversationStateParams {
  sessionId: string
  fase: SofiaPhase
  ultimaMensagem: string | null
  ultimaPergunta: string | null
  status: ConversationStatus
}

export function buildConversationState(params: BuildConversationStateParams): ConversationStateSnapshot {
  return {
    sessionId: params.sessionId,
    fase: params.fase,
    ultimaMensagem: params.ultimaMensagem,
    ultimaPergunta: params.ultimaPergunta,
    status: params.status,
    atualizadoEm: new Date().toISOString(),
  }
}
