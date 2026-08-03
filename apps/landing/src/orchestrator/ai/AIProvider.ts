/**
 * AIProvider (RFC-004).
 *
 * Interface padronizada que qualquer provedor de IA deve implementar para
 * ser plugado no `AIGateway`. Nenhum outro módulo da Sofia (Orchestrator,
 * Planner, ActionEngine) conhece isto diretamente — só o Gateway.
 */

export type AIRequestKind = "analysis" | "response"

/** Documento de conhecimento já encontrado (ex.: `KnowledgeEngine.searchByQuestion()`) para a IA basear a resposta — nunca o texto completo do `KnowledgeDocument`, só o que o prompt precisa (FEATURE-003). */
export interface AIKnowledgeDocument {
  titulo: string
  conteudo: string
}

export interface AIRequest {
  kind: AIRequestKind
  prompt: string
  /** Dados adicionais livres (ex.: Context/Plan resumidos) — cada provider decide o que fazer com isso. */
  context?: Record<string, unknown>
  /** Documentos que a IA deve usar como base exclusiva da resposta (FEATURE-003) — campo próprio, não passa pelo `context` genérico porque não é string-serializável do mesmo jeito. */
  knowledgeDocuments?: AIKnowledgeDocument[]
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
