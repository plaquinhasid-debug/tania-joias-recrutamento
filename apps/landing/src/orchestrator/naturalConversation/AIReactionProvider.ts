/**
 * FEATURE-005, Parte 3, Objetivo 5 — interface do provedor de reação por IA.
 *
 * A implementação real será feita quando a Feature entrar em Shadow (uma
 * fase futura, ainda não iniciada). Por enquanto só existe a interface e um
 * stub que lança de propósito — nada aqui chama a Anthropic, e
 * `NaturalConversationEngine` não invoca este provider nesta parte (ver
 * comentário lá).
 */
import type { ReactionRequest } from "./types"

export interface AIReactionProvider {
  generateReaction(request: ReactionRequest): Promise<string>
}

/** Stub — nunca deve ser chamado de verdade nesta fase. */
export const notImplementedAIReactionProvider: AIReactionProvider = {
  async generateReaction(_request: ReactionRequest): Promise<string> {
    throw new Error("Not implemented")
  },
}
