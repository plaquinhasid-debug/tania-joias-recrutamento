/**
 * Tool (RFC-004).
 *
 * Interface genérica que toda ferramenta de conhecimento da Sofia deve
 * implementar. O `ActionEngine` nunca consulta banco/Supabase/FAQ/settings
 * diretamente — ele pede ao `ToolEngine`, que descobre e executa a Tool
 * certa.
 */

export type ToolName =
  | "FAQ"
  | "BusinessRules"
  | "Products"
  | "Cities"
  | "Settings"
  | "CandidateHistory"
  | "KnowledgeBase"

export interface ToolResult<TData = unknown> {
  tool: ToolName
  success: boolean
  data: TData | null
}

export interface Tool<TInput = unknown, TData = unknown> {
  readonly name: ToolName
  execute(input?: TInput): Promise<ToolResult<TData>>
}
