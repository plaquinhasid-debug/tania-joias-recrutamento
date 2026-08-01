/**
 * DecisionEngine (RFC-005).
 *
 * "O DecisionEngine pensa": recebe a Intenção classificada + Plano +
 * Contexto + ConversationState + Objetivos, e devolve uma Decisão
 * estruturada — nunca executa nada, nunca chama IA, nunca consulta banco
 * ou Tool. Quem executa é o `ActionEngine`.
 *
 * Totalmente determinístico (um switch sobre o tipo de intenção,
 * considerando o Plano quando relevante).
 */
import type { ObjectivesEvaluation } from "./Objectives"
import type { ConversationStateSnapshot, Decision, Intent, Plan, SofiaContext } from "./types"

export interface DecisionInput {
  intent: Intent
  plan: Plan
  context: SofiaContext
  state: ConversationStateSnapshot
  objectivesEvaluation: ObjectivesEvaluation
}

export function decide(input: DecisionInput): Decision {
  const { intent, plan, state } = input

  if (state.status !== "em_andamento") {
    return {
      type: "IGNORE",
      reason: `Conversa com status "${state.status}" — nenhuma decisão nova é aplicável.`,
      confidence: 1,
      metadata: { intent: intent.type },
    }
  }

  switch (intent.type) {
    case "OBJECTION":
      return {
        type: "REGISTER_OBJECTION",
        reason: "Intenção classificada como objeção.",
        confidence: intent.confidence,
        metadata: { intent: intent.type },
      }

    case "DOUBT":
      return {
        type: "REGISTER_DOUBT",
        reason: "Intenção classificada como dúvida.",
        confidence: intent.confidence,
        metadata: { intent: intent.type },
      }

    case "QUESTION":
      return {
        type: "ANSWER_WITH_TOOL",
        reason: "Candidata fez uma pergunta — precisaria consultar uma ferramenta de conhecimento (ToolEngine ainda não é chamado nesta fase).",
        confidence: intent.confidence,
        metadata: { intent: intent.type },
      }

    case "END_CONVERSATION":
      return {
        type: "FINALIZE",
        reason: "Intenção classificada como encerramento da conversa.",
        confidence: intent.confidence,
        metadata: { intent: intent.type },
      }

    case "ANSWER":
    case "CONFIRMATION":
    case "NEGATION":
      if (plan.prontoParaFinalizar) {
        return {
          type: "FINALIZE",
          reason: "Resposta recebida e todos os objetivos rastreados já estão concluídos.",
          confidence: intent.confidence,
          metadata: { intent: intent.type },
        }
      }
      return {
        type: "CONTINUE_FLOW",
        reason: "Resposta recebida — segue o roteiro normalmente.",
        confidence: intent.confidence,
        metadata: { intent: intent.type },
      }

    case "GREETING":
    case "SMALL_TALK":
      return {
        type: "CONTINUE_FLOW",
        reason: "Saudação/conversa informal — segue o roteiro sem alterar o fluxo.",
        confidence: intent.confidence,
        metadata: { intent: intent.type },
      }

    case "UNKNOWN":
    default:
      return {
        type: "WAIT",
        reason: "Intenção não reconhecida com confiança suficiente.",
        confidence: intent.confidence,
        metadata: { intent: intent.type },
      }
  }
}
