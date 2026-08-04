/**
 * FEATURE-005, Parte 3, Objetivo 1 — infraestrutura da futura "condução
 * natural" (shadow puro). Recebe informações do turno e MONTA uma possível
 * reação — nunca conversa diretamente, nunca chama a Anthropic, nunca é
 * consumido por `useSofiaFlow.ts`.
 *
 * Regra de disparo (Parte 3, ajustada na Parte 2 Objetivo 7): usa
 * `request.canFillCurrentField` quando presente (vindo do classificador
 * contextual da Parte 2); na ausência dele, cai pro critério antigo
 * (`classification === "ANSWER"`) — reagir a uma pergunta/dúvida/objeção/
 * despedida não faz sentido aqui, esses casos já têm (ou terão) tratamento
 * próprio em outro lugar.
 *
 * Estratégia `"AI"`: esta parte NUNCA invoca `AIReactionProvider` (que só
 * lança "Not implemented") — só sinaliza a estratégia resolvida. A geração
 * de conteúdo por IA de verdade fica pra quando a Feature entrar em Shadow.
 */
import { getDeterministicAcknowledgment } from "./DeterministicReactionProvider"
import { resolveReactionStrategy } from "./ReactionStrategyResolver"
import type { NaturalReaction, ReactionRequest, ReactionResponse } from "./types"

export function buildNaturalReaction(request: ReactionRequest): ReactionResponse {
  const strategy = resolveReactionStrategy(request.fieldKey)
  const podePreencher = request.canFillCurrentField ?? request.classification === "ANSWER"

  if (strategy === "NONE" || !podePreencher) {
    const reaction: NaturalReaction = { shouldReact: false, strategy: "NONE" }
    return { reaction }
  }

  if (strategy === "DETERMINISTIC") {
    const acknowledgment = getDeterministicAcknowledgment(request.fieldKey) ?? undefined
    const reaction: NaturalReaction = {
      shouldReact: Boolean(acknowledgment),
      strategy: "DETERMINISTIC",
      acknowledgment,
    }
    return { reaction }
  }

  // strategy === "AI" — só sinaliza, não gera conteúdo nesta parte.
  const reaction: NaturalReaction = {
    shouldReact: true,
    strategy: "AI",
    metadata: { pending: "geração por IA ainda não implementada nesta fase (Parte 3)" },
  }
  return { reaction }
}
