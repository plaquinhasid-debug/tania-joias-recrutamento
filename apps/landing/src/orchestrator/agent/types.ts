/**
 * Tipos do Agent Profile (RFC-009).
 *
 * Antes desta RFC, a "personalidade" da Sofia (tom, princípios, o que ela
 * pode e não pode fazer) não existia como dado — vivia implícita, espalhada
 * entre o texto fixo de `sofia-script.ts`, comentários de código e a cabeça
 * de quem estava construindo. `AgentProfile` centraliza isso como um
 * registro estruturado, único para cada agente.
 *
 * Puramente identidade/dado — nenhum campo aqui vira prompt de IA, nenhum
 * campo é lido por `SofiaOrchestrator` nesta fase (ver `INTEGRAÇÃO` na RFC:
 * "apenas preparar a arquitetura"). Sofia é só a primeira implementação;
 * `RecruitAgent`, `SalesAgent`, `SupportAgent` etc. no futuro seriam só mais
 * um `AgentProfile` registrado no `AgentRegistry`.
 */

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
  tone: string[]
  /** Código de idioma (ex.: `"pt-BR"`) — hoje a Sofia só opera em um idioma; o campo só prepara para o dia em que isso mudar. */
  language: string
  personality: string[]
  conversationStyle: string[]
  /** Regras de conduta que a agente nunca deve violar, independente do que for pedido na conversa. */
  principles: string[]
  /**
   * O que esta agente PODE fazer, em linguagem de identidade/negócio (ex.:
   * "Responder dúvidas"). Não confundir com `SOFIA_CAPABILITIES` em
   * `Capabilities.ts` (RFC-004), que é o catálogo TÉCNICO de que
   * ferramentas/ações o sistema expõe — os dois descrevem a mesma agente
   * em níveis diferentes e deliberadamente não foram unificados nesta RFC.
   */
  capabilities: string[]
  /** O que esta agente explicitamente NUNCA faz — o motor de regras determinístico (IPR/status do lead) continua sendo a única autoridade sobre aprovação/reprovação. */
  limitations: string[]
  goals: string[]
  /** Espaço livre para extensões futuras sem precisar mudar este tipo. */
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}
