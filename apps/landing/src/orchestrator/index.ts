export { SofiaOrchestrator } from "./SofiaOrchestrator"
export { OBJECTIVES, evaluateObjectives } from "./Objectives"
export type { ObjectivesEvaluation } from "./Objectives"
export { buildConversationState } from "./ConversationState"
export type { BuildConversationStateParams } from "./ConversationState"
export { buildContext } from "./Context"
export { createPlan, formatPlan } from "./Planner"
export { decideAction } from "./ActionEngine"
export { WorkingMemory } from "./WorkingMemory"
export type { MemoryEntry } from "./WorkingMemory"
export type { ConversationMemory, BusinessMemory, LongTermMemory } from "./MemoryTypes"
export { SOFIA_CAPABILITIES, getCapabilitiesByCategory } from "./Capabilities"
export type { Capability, CapabilityCategory } from "./Capabilities"

// AI Gateway (RFC-004) — única porta pra qualquer provedor de IA.
export { AIGateway, createDefaultAIGateway } from "./ai/AIGateway"
export type { AIGatewayConfig } from "./ai/AIGateway"
export { AnthropicProvider, ANTHROPIC_MODEL } from "./ai/AnthropicProvider"
export type { AIProvider, AIRequest, AIRequestKind, AIResponse } from "./ai/AIProvider"

// Tool Engine (RFC-004) — única porta pra qualquer consulta de conhecimento.
export { ToolEngine } from "./tools/ToolEngine"
export type { Tool, ToolName, ToolResult } from "./tools/Tool"
export type {
  BusinessRulesTool,
  CandidateHistoryTool,
  CitiesTool,
  FAQTool,
  KnowledgeBaseTool,
  ProductsTool,
  SettingsTool,
} from "./tools/types"

export type {
  Action,
  ActionType,
  ConversationEvent,
  ConversationStateSnapshot,
  ConversationStatus,
  Objective,
  ObjectiveId,
  ObjectiveStatus,
  OpenConcern,
  Plan,
  SofiaContext,
  TurnInput,
} from "./types"
