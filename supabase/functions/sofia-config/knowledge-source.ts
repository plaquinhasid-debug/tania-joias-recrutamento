export const KNOWLEDGE_SOURCE_MODES = ["LOCAL", "SHADOW", "PILOT"] as const

export type KnowledgeSourceMode = (typeof KNOWLEDGE_SOURCE_MODES)[number]

/**
 * Fail-safe da configuração: ausência, leitura inválida ou valor desconhecido
 * preservam o estado operacional atual (SHADOW) e nunca ativam PILOT.
 */
export function resolveKnowledgeSourceMode(value: unknown): KnowledgeSourceMode {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "SHADOW"
  const keys = Object.keys(value)
  if (keys.length !== 1 || keys[0] !== "modo") return "SHADOW"
  const mode = (value as { modo?: unknown }).modo
  return typeof mode === "string" && (KNOWLEDGE_SOURCE_MODES as readonly string[]).includes(mode)
    ? (mode as KnowledgeSourceMode)
    : "SHADOW"
}
