/**
 * ResponseComposer (FEATURE-001 / FEATURE-002).
 *
 * Monta a mensagem final enviada à candidata a partir de uma resposta de
 * IA já pronta — a primeira peça do Lamin Agent Core com efeito potencial
 * no texto que a candidata veria (ainda não conectada a nada real, ver
 * `INTEGRAÇÃO`/`NÃO IMPLEMENTAR` na FEATURE-002).
 *
 * Nunca chama IA, nunca decide regra de negócio, nunca altera o roteiro,
 * o Planner, o DecisionEngine ou o AI Gateway — só compõe texto.
 *
 * Pipeline (FEATURE-002, Objetivo 3):
 *   reconhecimento (`AcknowledgmentLibrary`) → conteúdo validado pela IA OU
 *   fallback acolhedor (`ResponsePolicies` + Objetivo 4) → transição
 *   (`TransitionLibrary`) → próxima pergunta do roteiro → validação final
 *   da mensagem composta (`runFinalPolicies`, Objetivo 6) → se ainda assim
 *   falhar, fallback mínimo absoluto.
 *
 * Uma falha da IA (ou uma composição que ultrapasse os limites finais)
 * nunca pode travar ou distorcer a conversa — mesmo espírito de fallback
 * já usado em `sofia-reagir` e no `agent-ai-gateway`.
 */
import { createLogger } from "../devLog"
import {
  pickAcknowledgment,
  startsWithAcknowledgment,
} from "./AcknowledgmentLibrary"
import { runAllPolicies, runFinalPolicies } from "./ResponsePolicies"
import { pickTransition } from "./TransitionLibrary"
import type { AcknowledgmentKind, ComposeResponseInput, ComposedResponse, PolicyViolation } from "./types"
import type { IntentType } from "../types"

const log = createLogger("[ResponseComposer]")

/**
 * Corpo determinístico e seguro usado quando o conteúdo da IA precisa ser
 * descartado (FEATURE-002, Objetivo 4). Nunca inventa informação, nunca
 * menciona erro técnico, IA ou sistema, nunca promete contato que não é
 * garantido pelo processo — por isso a formulação neutra ("prefiro não
 * passar uma informação imprecisa") em vez de "nossa equipe poderá
 * esclarecer" (a própria RFC sinalizou que essa segunda frase só é segura
 * SE for uma promessa operacional real, o que não foi confirmado).
 */
const FALLBACK_BODY_BY_KIND: Record<AcknowledgmentKind, string> = {
  QUESTION: "Prefiro não passar uma informação imprecisa neste momento.",
  DOUBT: "Prefiro não passar uma informação imprecisa neste momento — não quero deixar isso ainda mais confuso.",
  OBJECTION: "Quero tratar esse assunto com cuidado, sem passar uma orientação imprecisa.",
  ANSWER: "Prefiro não passar uma informação imprecisa neste momento.",
  SMALL_TALK: "Prefiro não passar uma informação imprecisa neste momento.",
  GENERIC: "Prefiro não passar uma informação imprecisa neste momento.",
}

/** Ponte entre o vocabulário do Agent Core (`IntentType`) e o vocabulário próprio do Composer (`AcknowledgmentKind`) — ver nota de acoplamento em `types.ts`. */
function mapIntentToAcknowledgmentKind(intent: IntentType | undefined): AcknowledgmentKind {
  switch (intent) {
    case "QUESTION":
      return "QUESTION"
    case "DOUBT":
      return "DOUBT"
    case "OBJECTION":
      return "OBJECTION"
    case "ANSWER":
    case "CONFIRMATION":
    case "NEGATION":
      return "ANSWER"
    case "GREETING":
    case "SMALL_TALK":
      return "SMALL_TALK"
    case "END_CONVERSATION":
    case "UNKNOWN":
    default:
      return "GENERIC"
  }
}

function juntarPartes(partes: Array<string | undefined>): string {
  return partes
    .filter((p): p is string => Boolean(p && p.trim()))
    .map((p) => p.trim())
    .join("\n\n")
}

export function composeResponse(input: ComposeResponseInput): ComposedResponse {
  const kind = mapIntentToAcknowledgmentKind(input.intent)
  const contentPolicyResult = runAllPolicies(input.aiResponse)
  const transition = pickTransition({ avoid: input.lastTransition })

  log("Kind de acknowledgment:", kind)
  log("Policies do conteúdo da IA:", contentPolicyResult)

  let aiContentUsed = contentPolicyResult.passed
  let content = aiContentUsed ? input.aiResponse.trim() : FALLBACK_BODY_BY_KIND[kind]
  let violations: PolicyViolation[] = contentPolicyResult.passed ? [] : contentPolicyResult.violations

  // Objetivo 5: se a própria resposta da IA já começa com um reconhecimento
  // equivalente, não adiciona outro — nunca se aplica ao corpo de fallback
  // (que nunca inclui reconhecimento próprio).
  let acknowledgment: string | undefined =
    aiContentUsed && startsWithAcknowledgment(input.aiResponse)
      ? undefined
      : pickAcknowledgment({ kind, avoid: input.lastAcknowledgment })

  const build = (): { fullMessage: string; questionCountText: string } => {
    const fullMessage = juntarPartes([acknowledgment, content, transition, input.currentQuestion])
    const questionCountText = juntarPartes([acknowledgment, content])
    return { fullMessage, questionCountText }
  }

  let { fullMessage, questionCountText } = build()
  let finalCheck = runFinalPolicies(fullMessage, questionCountText)
  log("Validação final (tentativa 1):", finalCheck)

  // Objetivo 6: se a composição de sucesso ultrapassar os limites finais
  // (ex.: conteúdo da IA perto do teto + acknowledgment + transição +
  // pergunta somam palavras/parágrafos demais), cai pro fallback acolhedor
  // antes de desistir — o conteúdo da IA nunca é "meio usado".
  if (!finalCheck.passed && aiContentUsed) {
    log("Composição de sucesso falhou na validação final — recompondo com fallback acolhedor.")
    aiContentUsed = false
    content = FALLBACK_BODY_BY_KIND[kind]
    acknowledgment = pickAcknowledgment({ kind, avoid: input.lastAcknowledgment })
    violations = [...violations, ...finalCheck.violations]
    ;({ fullMessage, questionCountText } = build())
    finalCheck = runFinalPolicies(fullMessage, questionCountText)
    log("Validação final (tentativa 2, fallback acolhedor):", finalCheck)
  }

  // Fallback mínimo absoluto (Objetivo 6): se mesmo o fallback acolhedor
  // ultrapassar os limites finais — cenário defensivo, não esperado com as
  // constantes curadas de hoje — a mensagem vira só a pergunta do roteiro
  // (ou uma continuação genérica, se nem isso houver). Nunca deixa a
  // interação sem resposta nenhuma.
  if (!finalCheck.passed) {
    log("Fallback acolhedor também falhou na validação final — usando fallback mínimo absoluto.", finalCheck.violations)
    violations = [...violations, ...finalCheck.violations]
    acknowledgment = undefined
    fullMessage = input.currentQuestion?.trim() || "Podemos continuar?"
  }

  return {
    message: fullMessage,
    acknowledgment,
    aiContentUsed,
    transition,
    currentQuestion: input.currentQuestion,
    usedFallback: !aiContentUsed,
    policyViolations: violations,
    finalValidationPassed: finalCheck.passed,
  }
}
