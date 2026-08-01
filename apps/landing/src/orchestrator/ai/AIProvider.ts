/**
 * AIProvider (RFC-004).
 *
 * Interface padronizada que qualquer provedor de IA deve implementar para
 * ser plugado no `AIGateway`. Nenhum outro módulo da Sofia (Orchestrator,
 * Planner, ActionEngine) conhece isto diretamente — só o Gateway.
 */

export type AIRequestKind = "analysis" | "response"

export interface AIRequest {
  kind: AIRequestKind
  prompt: string
  /** Dados adicionais livres (ex.: Context/Plan resumidos) — cada provider decide o que fazer com isso. */
  context?: Record<string, unknown>
}

export interface AIResponse {
  content: string
  provider: string
  model: string
  latencyMs: number
}

export interface AIProvider {
  readonly name: string
  generate(request: AIRequest): Promise<AIResponse>
}
