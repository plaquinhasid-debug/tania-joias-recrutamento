export { SofiaOrchestrator } from "./SofiaOrchestrator"
export type { SofiaOrchestratorConfig } from "./SofiaOrchestrator"
export { OBJECTIVES, evaluateObjectives } from "./Objectives"
export type { ObjectivesEvaluation } from "./Objectives"
export { buildConversationState } from "./ConversationState"
export type { BuildConversationStateParams } from "./ConversationState"
export { buildContext } from "./Context"
export { createPlan, formatPlan } from "./Planner"
export { classifyIntent } from "./IntentClassifier"
export { decide } from "./DecisionEngine"
export type { DecisionInput } from "./DecisionEngine"
export { executeDecision } from "./ActionEngine"
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
export { KnowledgeTool } from "./tools/KnowledgeTool"

// Knowledge Engine (RFC-006) — localiza conhecimento institucional estruturado.
export { KnowledgeEngine, createDefaultKnowledgeEngine } from "./knowledge/KnowledgeEngine"
export { InMemoryKnowledgeRepository } from "./knowledge/KnowledgeRepository"
export type { KnowledgeRepository } from "./knowledge/KnowledgeRepository"
export { SEED_KNOWLEDGE_DOCUMENTS } from "./knowledge/seedDocuments"
export { KNOWLEDGE_CATEGORIES } from "./knowledge/types"
export type {
  KnowledgeCategory,
  KnowledgeDocument,
  KnownKnowledgeCategory,
  KnowledgeSearchQuery,
} from "./knowledge/types"

// Agent Profile (RFC-009) — identidade oficial de cada agente do Lamin Agent Core.
export { AgentRegistry, createDefaultAgentRegistry } from "./agent/AgentRegistry"
export { AgentFactory, createDefaultAgentFactory } from "./agent/AgentFactory"
export type { AgentProfile, AgentCapabilityId, AgentRestrictionId, AgentRuntimeConfig, AgentRuntimeSnapshot } from "./agent/types"
export { SOFIA_PROFILE } from "./agent/profiles/sofia"

// Agent Runtime (RFC-010) — instância executável de um agente + composition root da Sofia.
export { AgentRuntime } from "./agent/AgentRuntime"
export { createSofiaRuntime, createSofiaOrchestrator } from "./agent/createSofiaRuntime"

export type {
  Action,
  ConversationEvent,
  ConversationOutcome,
  ConversationStateSnapshot,
  ConversationStatus,
  Decision,
  DecisionType,
  Intent,
  IntentType,
  Objective,
  ObjectiveId,
  ObjectiveStatus,
  OpenConcern,
  OrchestratorErrorCode,
  Plan,
  SofiaContext,
  TurnInput,
} from "./types"
