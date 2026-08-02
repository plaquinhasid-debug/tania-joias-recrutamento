/**
 * Tipos do Response Composer (FEATURE-001).
 *
 * O Composer não gera texto — só COMPÕE a mensagem final a partir de uma
 * resposta de IA já pronta, seguindo obrigatoriamente o PLAYBOOK-001
 * (`docs/playbooks/PLAYBOOK-001-sofia.md`). Nunca chama IA, nunca decide
 * regra de negócio, nunca altera o roteiro/Planner/DecisionEngine.
 */

export interface ComposeResponseInput {
  /** Resposta bruta gerada pela IA (ex.: via `agent-ai-gateway`, RFC-011) — ainda não validada. */
  aiResponse: string
  /** Pergunta atual do roteiro — anexada ao final da mensagem composta, quando houver. */
  currentQuestion?: string
  /** Contexto já conhecido da conversa — hoje só repassado adiante para uso futuro (ex.: personalizar transição); não influencia a composição nesta fase. */
  context?: Record<string, unknown>
  /** Decisão atual do DecisionEngine (ex.: `"CONTINUE_FLOW"`) — mesmo motivo do campo acima: recebido, não usado ainda. */
  decision?: string
  /** Última transição usada nesta conversa, se quem chama rastrear isso — evita repetir a mesma duas vezes seguidas (PLAYBOOK-001: "nunca repetir sempre a mesma frase"). Opcional. */
  lastTransitionUsed?: string
}

export type PolicyViolationCode =
  | "EMPTY_TEXT"
  | "EXCEEDS_LENGTH"
  | "TOO_MANY_PARAGRAPHS"
  | "MULTIPLE_QUESTIONS"
  | "FORBIDDEN_PROMISE"
  | "FORBIDDEN_PHRASE"

export interface PolicyViolation {
  code: PolicyViolationCode
  detail: string
}

export interface PolicyCheckResult {
  passed: boolean
  violations: PolicyViolation[]
}

export interface ComposedResponse {
  /** Mensagem final pronta para exibir à candidata. */
  message: string
  /**
   * `true` quando a resposta da IA violou alguma política e foi descartada
   * — a mensagem final, nesse caso, é só transição + próxima pergunta
   * (nunca a candidata vê um texto fora do PLAYBOOK-001).
   */
  usedFallback: boolean
  /** Violações encontradas (vazio quando `usedFallback` é `false`). */
  violations: PolicyViolation[]
  /** Qual transição da `TransitionLibrary` foi escolhida nesta composição. */
  transitionUsed: string
}
