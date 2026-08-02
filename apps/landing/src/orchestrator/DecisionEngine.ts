/**
 * DecisionEngine (RFC-005 / RFC-008).
 *
 * "O DecisionEngine pensa": recebe a Intenção classificada + Plano +
 * Contexto + ConversationState + Objetivos, e devolve uma Decisão
 * estruturada — nunca executa nada, nunca chama IA, nunca consulta banco
 * ou Tool. Quem executa é o `ActionEngine`.
 *
 * Totalmente determinístico (um switch sobre o tipo de intenção,
 * considerando o Plano quando relevante).
 *
 * RFC-008: toda Decision `FINALIZE` agora carrega um `outcome` explícito
 * (`COMPLETED` quando os objetivos obrigatórios foram concluídos,
 * `ABANDONED` quando a candidata encerra antes disso) — antes disso o
 * `FINALIZE` sozinho não distinguia esses dois casos.
 */
import { OBJECTIVES } from "./Objectives"
import type { ObjectivesEvaluation } from "./Objectives"
import type { ConversationStateSnapshot, Decision, Intent, Plan, SofiaContext } from "./types"

export interface DecisionInput {
  intent: Intent
  plan: Plan
  context: SofiaContext
  state: ConversationStateSnapshot
  objectivesEvaluation: ObjectivesEvaluation
}

/**
 * "Todos os objetivos OBRIGATÓRIOS concluídos" (RFC-008) — de propósito não
 * reaproveita `plan.prontoParaFinalizar` (que hoje significa "os 9 estão
 * concluídos", sem distinguir obrigatório/opcional). Como todo objetivo
 * ainda é `required: true`, o resultado é idêntico por enquanto — mas esta
 * função é a que continua correta no dia em que algum objetivo virar
 * opcional.
 */
function todosObjetivosObrigatoriosConcluidos(evaluation: ObjectivesEvaluation): boolean {
  return evaluation.pendentes.every((status) => {
    const objetivo = OBJECTIVES.find((o) => o.id === status.id)
    return !objetivo?.required
  })
}

export function decide(input: DecisionInput): Decision {
  const { intent, state, objectivesEvaluation } = input

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

    case "END_CONVERSATION": {
      const completou = todosObjetivosObrigatoriosConcluidos(objectivesEvaluation)
      return {
        type: "FINALIZE",
        outcome: completou ? "COMPLETED" : "ABANDONED",
        reason: completou
          ? "Encerramento da conversa recebido após todos os objetivos obrigatórios concluídos."
          : "A candidata encerrou a conversa antes da conclusão dos objetivos obrigatórios.",
        confidence: intent.confidence,
        metadata: { intent: intent.type },
      }
    }

    case "ANSWER":
    case "CONFIRMATION":
    case "NEGATION":
      if (todosObjetivosObrigatoriosConcluidos(objectivesEvaluation)) {
        return {
          type: "FINALIZE",
          outcome: "COMPLETED",
          reason: "Resposta recebida e todos os objetivos obrigatórios já estão concluídos.",
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
