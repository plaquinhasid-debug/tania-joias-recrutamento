/**
 * Tipos do Response Composer (FEATURE-001 / FEATURE-002).
 *
 * O Composer não gera texto original — só COMPÕE a mensagem final a partir
 * de uma resposta de IA já pronta, seguindo obrigatoriamente o
 * PLAYBOOK-001 (`docs/playbooks/PLAYBOOK-001-sofia.md`). Nunca chama IA,
 * nunca decide regra de negócio, nunca altera o roteiro/Planner/DecisionEngine.
 *
 * DECISÃO DE ACOPLAMENTO (FEATURE-002, Objetivo 2): `intent` abaixo usa o
 * `IntentType` real do Agent Core (`../types`) em vez de um tipo local
 * duplicado. Verifiquei que isso NÃO cria dependência circular:
 * `orchestrator/types.ts` não importa nada de `orchestrator/composer/` —
 * é uma dependência de mão única (composer → core), o mesmo padrão já
 * usado por `simulator/types.ts`. `AcknowledgmentKind` continua sendo um
 * vocabulário próprio do composer (mais enxuto que `IntentType`) porque
 * várias intenções mapeiam para o mesmo tipo de reconhecimento; a ponte
 * entre os dois vocabulários é feita por `mapIntentToAcknowledgmentKind`,
 * em `ResponseComposer.ts`.
 */
import type { IntentType } from "../types"

/**
 * Vocabulário do `AcknowledgmentLibrary` — mais enxuto que `IntentType`
 * porque várias intenções (ex.: `CONFIRMATION`/`NEGATION`) reconhecem-se da
 * mesma forma que uma `ANSWER` comum.
 */
export type AcknowledgmentKind = "QUESTION" | "DOUBT" | "OBJECTION" | "ANSWER" | "SMALL_TALK" | "GENERIC"

/**
 * Classificação de uma transição (FEATURE-002.1): `DECLARATIVE` nunca tem
 * "?"; `INTERROGATIVE` sempre tem. Existe pra impedir a mensagem final de
 * acabar com duas perguntas visíveis (a transição + a pergunta do
 * roteiro) — transições `INTERROGATIVE` só podem ser usadas quando NÃO
 * houver `currentQuestion` sendo anexada depois.
 */
export type TransitionKind = "DECLARATIVE" | "INTERROGATIVE"

export interface ComposeResponseInput {
  /** Resposta bruta gerada pela IA (ex.: via `agent-ai-gateway`, RFC-011) — ainda não validada. */
  aiResponse: string
  /** Pergunta atual do roteiro — anexada ao final da mensagem composta, quando houver. */
  currentQuestion?: string
  /** Contexto já conhecido da conversa — recebido, não usado na composição nesta fase (espaço reservado para uso futuro). */
  context?: Record<string, unknown>
  /** Decisão atual do DecisionEngine (ex.: `"CONTINUE_FLOW"`) — mesmo motivo do campo acima: recebido, não usado ainda. */
  decision?: string
  /** Intenção já classificada pelo `IntentClassifier`, se disponível — decide a categoria do acknowledgment (ver `AcknowledgmentKind`). Sem valor, cai em `GENERIC`. */
  intent?: IntentType
  /** Último acknowledgment usado nesta conversa, se quem chama rastrear isso — evita repetição imediata. */
  lastAcknowledgment?: string
  /** Última transição usada nesta conversa, se quem chama rastrear isso — evita repetição imediata (PLAYBOOK-001: "nunca repetir sempre a mesma frase"). */
  lastTransition?: string
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
  /** Acknowledgment efetivamente usado — `undefined` quando a própria resposta da IA já continha um (ver Objetivo 5) ou quando o fallback mínimo foi acionado. */
  acknowledgment?: string
  /** `true` quando o conteúdo da resposta da IA foi usado como está (passou nas `ResponsePolicies`); `false` quando foi descartado por um fallback. */
  aiContentUsed: boolean
  /** Transição escolhida nesta composição. */
  transition: string
  /** Pergunta atual do roteiro, repassada do input (conveniência de leitura do resultado). */
  currentQuestion?: string
  /** `true` sempre que `aiContentUsed` é `false` — a mensagem final não usa o texto original da IA. */
  usedFallback: boolean
  /** Violações que levaram ao fallback (do conteúdo da IA e/ou da validação final) — vazio quando `aiContentUsed` é `true` e a validação final passou de primeira. */
  policyViolations: PolicyViolation[]
  /** `true` se a mensagem final (already composta) passou na validação final (Objetivo 6) — `false` só no caminho do fallback mínimo absoluto. */
  finalValidationPassed: boolean
}
