/**
 * Capabilities (RFC-004).
 *
 * Catálogo interno e estático de tudo que a Sofia possui hoje, por
 * categoria — só descritivo (não afeta nada em runtime). Permite que, no
 * futuro, o próprio agente (ou quem estiver depurando) consulte quais
 * recursos existem e quais já estão de fato disponíveis.
 */

export type CapabilityCategory = "ia" | "ferramentas" | "memoria" | "planejamento" | "objetivos"

export interface Capability {
  categoria: CapabilityCategory
  nome: string
  descricao: string
  /** Existe e está funcional nesta fase (não confundir com "wired na conversa real" — nada está, ver RFCs). */
  disponivel: boolean
}

export const SOFIA_CAPABILITIES: readonly Capability[] = [
  { categoria: "ia", nome: "AIGateway", descricao: "Porta única e obrigatória para qualquer provedor de IA.", disponivel: true },
  {
    categoria: "ia",
    nome: "AnthropicProvider",
    descricao: "Provedor Anthropic (Claude) — implementa AIProvider, mas ainda não faz chamada real (requer Edge Function proxy).",
    disponivel: false,
  },
  { categoria: "ferramentas", nome: "ToolEngine", descricao: "Registro/executor central de ferramentas de conhecimento.", disponivel: true },
  { categoria: "ferramentas", nome: "FAQTool", descricao: "Consulta ao FAQ da Landing Page.", disponivel: false },
  { categoria: "ferramentas", nome: "BusinessRulesTool", descricao: "Consulta às regras de negócio (IPR, thresholds).", disponivel: false },
  { categoria: "ferramentas", nome: "ProductsTool", descricao: "Consulta ao catálogo de produtos.", disponivel: false },
  { categoria: "ferramentas", nome: "CitiesTool", descricao: "Consulta às cidades atendidas.", disponivel: false },
  { categoria: "ferramentas", nome: "SettingsTool", descricao: "Consulta a settings arbitrários.", disponivel: false },
  { categoria: "ferramentas", nome: "CandidateHistoryTool", descricao: "Histórico da candidata (respostas/conversas anteriores).", disponivel: false },
  { categoria: "ferramentas", nome: "KnowledgeBaseTool", descricao: "Base de conhecimento livre.", disponivel: false },
  { categoria: "memoria", nome: "WorkingMemory", descricao: "Memória da conversa atual (em processo, não persistida).", disponivel: true },
  { categoria: "memoria", nome: "ConversationMemory", descricao: "Resumo de médio prazo dentro da mesma conversa.", disponivel: false },
  { categoria: "memoria", nome: "BusinessMemory", descricao: "Conhecimento de negócio persistente entre candidatas.", disponivel: false },
  { categoria: "memoria", nome: "LongTermMemory", descricao: "Memória entre sessões da mesma candidata.", disponivel: false },
  { categoria: "planejamento", nome: "Planner", descricao: "Gera o Plano determinístico a partir dos Objetivos.", disponivel: true },
  { categoria: "planejamento", nome: "ActionEngine", descricao: "Transforma o Plano em uma Ação estruturada.", disponivel: true },
  { categoria: "objetivos", nome: "Objectives", descricao: "Rastreia os 9 objetivos de qualificação da conversa.", disponivel: true },
] as const

export function getCapabilitiesByCategory(categoria: CapabilityCategory): Capability[] {
  return SOFIA_CAPABILITIES.filter((c) => c.categoria === categoria)
}
