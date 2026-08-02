/**
 * Tipos do Agent Profile (RFC-009 / RFC-010).
 *
 * Antes desta RFC, a "personalidade" da Sofia (tom, princípios, o que ela
 * pode e não pode fazer) não existia como dado — vivia implícita, espalhada
 * entre o texto fixo de `sofia-script.ts`, comentários de código e a cabeça
 * de quem estava construindo. `AgentProfile` centraliza isso como um
 * registro estruturado, único para cada agente.
 *
 * Puramente identidade/dado — nenhum campo aqui vira prompt de IA. A partir
 * da RFC-010 o perfil passa a ser injetado no `SofiaOrchestrator` (ver
 * `createSofiaRuntime.ts`), mas continua só identidade: nenhuma capability
 * é executada, nenhuma limitation bloqueia nada ainda. Sofia é só a
 * primeira implementação; `RecruitAgent`, `SalesAgent`, `SupportAgent` etc.
 * no futuro seriam só mais um `AgentProfile` registrado no `AgentRegistry`.
 *
 * RFC-010, Objetivo 10 (imutabilidade): os campos de lista/objeto usam
 * `readonly` no tipo, e `freezeProfile()` (`freezeProfile.ts`) congela o
 * perfil de verdade em tempo de execução assim que ele é registrado — ver
 * `AgentRegistry.register()`.
 */

/**
 * Vocabulário fechado do que um agente PODE fazer (RFC-010) — representação
 * estruturada de `AgentProfile.capabilities` (que continua existindo como
 * texto livre, para leitura humana). Nesta RFC isso só é carregado no
 * `AgentRuntime`; nenhuma capability é executada e o `DecisionEngine` ainda
 * não valida nada contra esta lista.
 */
export type AgentCapabilityId =
  | "ANSWER_QUESTIONS"
  | "SEARCH_KNOWLEDGE"
  | "COLLECT_INFORMATION"
  | "ANALYZE_PROFILE"
  | "GENERATE_SUMMARY"
  | "REGISTER_EVENTS"

/**
 * Vocabulário fechado do que um agente NUNCA pode fazer (RFC-010) —
 * representação estruturada de `AgentProfile.limitations`. O motor de
 * regras determinístico (IPR/status do lead, server-side) continua sendo a
 * única autoridade sobre aprovação/reprovação — isto aqui só DOCUMENTA essa
 * restrição de forma estruturada, não a aplica.
 */
export type AgentRestrictionId =
  | "CANNOT_APPROVE_CANDIDATE"
  | "CANNOT_REJECT_CANDIDATE"
  | "CANNOT_CHANGE_BUSINESS_RULES"
  | "CANNOT_MODIFY_DATABASE"
  | "CANNOT_CREATE_KNOWLEDGE"
  | "CANNOT_WRITE_UNVERIFIED_KNOWLEDGE"

export interface AgentProfile {
  /** Identificador estável, usado como chave no `AgentRegistry` (ex.: `"sofia"`). */
  id: string
  name: string
  /** Ex.: "Consultora Oficial de Recrutamento". */
  role: string
  /** Versionamento do PERFIL em si (semver) — independente da versão do código. */
  version: string
  description: string
  mission: string
  vision: string
  /** Atributos de tom — inclui tanto o que a agente É ("Elegante") quanto o que ela NUNCA deve soar ("Nunca agressivo"). */
  tone: readonly string[]
  /** Código de idioma (ex.: `"pt-BR"`) — hoje a Sofia só opera em um idioma; o campo só prepara para o dia em que isso mudar. */
  language: string
  personality: readonly string[]
  conversationStyle: readonly string[]
  /** Regras de conduta que a agente nunca deve violar, independente do que for pedido na conversa. */
  principles: readonly string[]
  /**
   * O que esta agente PODE fazer, em linguagem de identidade/negócio (ex.:
   * "Responder dúvidas"). Não confundir com `SOFIA_CAPABILITIES` em
   * `Capabilities.ts` (RFC-004), que é o catálogo TÉCNICO de que
   * ferramentas/ações o sistema expõe — os dois descrevem a mesma agente
   * em níveis diferentes e deliberadamente não foram unificados nesta RFC.
   */
  capabilities: readonly string[]
  /** Mesma lista de `capabilities`, em forma estruturada (RFC-010) — mesma ordem, mesmo significado, só vocabulário fechado em vez de texto livre. */
  capabilityIds: readonly AgentCapabilityId[]
  /** O que esta agente explicitamente NUNCA faz — o motor de regras determinístico (IPR/status do lead) continua sendo a única autoridade sobre aprovação/reprovação. */
  limitations: readonly string[]
  /** Mesma lista de `limitations`, em forma estruturada (RFC-010). */
  restrictionIds: readonly AgentRestrictionId[]
  goals: readonly string[]
  /** Espaço livre para extensões futuras sem precisar mudar este tipo. */
  metadata: Readonly<Record<string, unknown>>
  createdAt: string
  updatedAt: string
}

/** Entrada para montar um `AgentRuntime` — só o perfil e a sessão; quem monta o Orchestrator é o composition root (`createSofiaRuntime.ts`), não o Runtime em si (RFC-010). */
export interface AgentRuntimeConfig {
  profile: Readonly<AgentProfile>
  sessionId: string
}

/** Retrato somente-leitura de uma instância de agente em execução — o que a RFC-010 pediu como `getRuntimeSnapshot()`. */
export interface AgentRuntimeSnapshot {
  agentId: string
  agentName: string
  agentVersion: string
  sessionId: string
  capabilities: readonly string[]
  active: boolean
}
