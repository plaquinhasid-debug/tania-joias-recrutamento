/**
 * Interfaces específicas de cada Tool prevista (RFC-004).
 *
 * Nenhuma tem implementação nesta fase — só a estrutura, pra ficar
 * preparada. Cada uma especializa `Tool` com um nome fixo e (quando fizer
 * sentido) um formato de dado mais específico.
 */
import type { Tool } from "./Tool"

export interface FAQTool extends Tool<{ pergunta: string }, { resposta: string }> {
  readonly name: "FAQ"
}

export interface BusinessRulesTool extends Tool<void, { ipr_pesos: unknown; ipr_thresholds: unknown }> {
  readonly name: "BusinessRules"
}

export interface ProductsTool extends Tool<void, unknown[]> {
  readonly name: "Products"
}

export interface CitiesTool extends Tool<void, { restringir: boolean; lista: string[] }> {
  readonly name: "Cities"
}

export interface SettingsTool extends Tool<{ chave: string }, unknown> {
  readonly name: "Settings"
}

export interface CandidateHistoryTool extends Tool<{ sessionId: string }, unknown[]> {
  readonly name: "CandidateHistory"
}

export interface KnowledgeBaseTool extends Tool<{ consulta: string }, unknown> {
  readonly name: "KnowledgeBase"
}
