/**
 * ResponseComposer (FEATURE-001 / FEATURE-002 / FEATURE-002.1).
 *
 * Monta a mensagem final enviada à candidata a partir de uma resposta de
 * IA já pronta — a primeira peça do Lamin Agent Core com efeito potencial
 * no texto que a candidata veria (ainda não conectada a nada real, ver
 * `INTEGRAÇÃO`/`NÃO IMPLEMENTAR` na FEATURE-002.1).
 *
 * Nunca chama IA, nunca decide regra de negócio, nunca altera o roteiro,
 * o Planner, o DecisionEngine ou o AI Gateway — só compõe texto.
 *
 * Pipeline:
 *   reconhecimento (`AcknowledgmentLibrary`) → conteúdo validado pela IA OU
 *   fallback acolhedor (`ResponsePolicies`) → transição declarativa/
 *   interrogativa conforme haja `currentQuestion` (`TransitionLibrary`) →
 *   próxima pergunta do roteiro → validação final da mensagem composta
 *   INTEIRA (`runFinalPolicies`) → se ainda assim falhar, fallback mínimo
 *   (nunca só a pergunta nua — sempre reconhecimento + transição fixa +
 *   pergunta, FEATURE-002.1 Objetivo 4).
 *
 * FEATURE-002.1 corrigiu dois bugs de contagem de perguntas:
 *   1. A validação final agora audita a mensagem composta INTEIRA (sem
 *      excluir transição/pergunta) — ver `runFinalPolicies`.
 *   2. Transições interrogativas ("Posso te fazer mais uma pergunta?") só
 *      são escolhidas quando NÃO há `currentQuestion` sendo anexada depois.
 *   3. Se o conteúdo da IA contém pergunta própria E existe
 *      `currentQuestion`, o conteúdo é sempre descartado (nunca reescrito) —
 *      ver `checkNoQuestionWhenScriptQuestionExists`.
 */
import { createLogger } from "../devLog"
import { pickAcknowledgment, startsWithAcknowledgment } from "./AcknowledgmentLibrary"
import { checkNoQuestionWhenScriptQuestionExists, runAllPolicies, runFinalPolicies } from "./ResponsePolicies"
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

/**
 * Transição fixa (não sorteada) do fallback mínimo absoluto (FEATURE-002.1,
 * Objetivo 4) — texto exato do template da RFC. Deliberadamente não vem do
 * `TransitionLibrary`: no último nível de segurança, previsibilidade máxima
 * importa mais que variação.
 */
const MINIMAL_FALLBACK_TRANSITION = "Agora vamos continuar nossa conversa."

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
  const hasScriptQuestion = Boolean(input.currentQuestion?.trim())

  const contentPolicyResult = runAllPolicies(input.aiResponse)
  const scriptQuestionConflict = checkNoQuestionWhenScriptQuestionExists(input.aiResponse, hasScriptQuestion)
  const contentPassed = contentPolicyResult.passed && !scriptQuestionConflict
  const contentViolations = scriptQuestionConflict
    ? [...contentPolicyResult.violations, scriptQuestionConflict]
    : contentPolicyResult.violations

  log("Kind de acknowledgment:", kind)
  log("Policies do conteúdo da IA:", { passed: contentPassed, violations: contentViolations })

  // FEATURE-002.1, Objetivo 1: transição interrogativa só quando não há pergunta do roteiro sendo anexada.
  let transition = pickTransition({ avoid: input.lastTransition, requireDeclarative: hasScriptQuestion })

  let aiContentUsed = contentPassed
  let content = contentPassed ? input.aiResponse.trim() : FALLBACK_BODY_BY_KIND[kind]
  let violations: PolicyViolation[] = contentPassed ? [] : contentViolations

  // Objetivo 5 (FEATURE-002): se a própria resposta da IA já começa com um
  // reconhecimento equivalente, não adiciona outro. Nunca se aplica ao
  // corpo de fallback (que nunca inclui reconhecimento próprio).
  let acknowledgment: string | undefined =
    aiContentUsed && startsWithAcknowledgment(input.aiResponse)
      ? undefined
      : pickAcknowledgment({ kind, avoid: input.lastAcknowledgment })

  const build = (): string => juntarPartes([acknowledgment, content, transition, input.currentQuestion])

  let fullMessage = build()
  let finalCheck = runFinalPolicies(fullMessage)
  log("Validação final (tentativa 1):", finalCheck)

  // Se a composição de sucesso ultrapassar os limites finais, cai pro
  // fallback acolhedor antes de desistir — o conteúdo da IA nunca é "meio usado".
  if (!finalCheck.passed && aiContentUsed) {
    log("Composição de sucesso falhou na validação final — recompondo com fallback acolhedor.")
    aiContentUsed = false
    content = FALLBACK_BODY_BY_KIND[kind]
    acknowledgment = pickAcknowledgment({ kind, avoid: input.lastAcknowledgment })
    violations = [...violations, ...finalCheck.violations]
    fullMessage = build()
    finalCheck = runFinalPolicies(fullMessage)
    log("Validação final (tentativa 2, fallback acolhedor):", finalCheck)
  }

  // Fallback mínimo (FEATURE-002.1, Objetivo 4): se mesmo o fallback
  // acolhedor ultrapassar os limites finais — cenário defensivo, não
  // esperado com as constantes curadas de hoje — a mensagem vira
  // reconhecimento + transição FIXA + pergunta do roteiro. Nunca só a
  // pergunta nua: a candidata nunca pode parecer ignorada depois de uma
  // dúvida ou objeção.
  if (!finalCheck.passed) {
    log("Fallback acolhedor também falhou na validação final — usando fallback mínimo.", finalCheck.violations)
    violations = [...violations, ...finalCheck.violations]
    acknowledgment = pickAcknowledgment({ kind, avoid: input.lastAcknowledgment })
    transition = MINIMAL_FALLBACK_TRANSITION
    fullMessage = juntarPartes([acknowledgment, transition, input.currentQuestion?.trim() || "Podemos continuar?"])
    aiContentUsed = false
    // Reavalia só para reportar `finalValidationPassed` com precisão — não há mais nenhum nível de fallback abaixo deste.
    finalCheck = runFinalPolicies(fullMessage)
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
