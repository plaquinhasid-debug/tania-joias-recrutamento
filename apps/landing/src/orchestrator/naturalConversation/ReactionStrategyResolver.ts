/**
 * FEATURE-005, Parte 3, Objetivo 3 — resolve a estratégia de reação de um
 * campo a partir da configuração isolada (`fieldReactionConfig.ts`). Campo
 * desconhecido/inexistente devolve `"NONE"` (nunca lança).
 */
import { FIELD_REACTION_CONFIG } from "./fieldReactionConfig"
import type { ReactionStrategy } from "./types"

export function resolveReactionStrategy(fieldKey: string): ReactionStrategy {
  return FIELD_REACTION_CONFIG[fieldKey as keyof typeof FIELD_REACTION_CONFIG] ?? "NONE"
}
