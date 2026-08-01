/**
 * ActionEngine (RFC-003).
 *
 * "O Action Engine executa": recebe um Plano (+ estado/contexto) e decide
 * qual Ação estruturada é a correta — nunca texto, nunca decide sozinho o
 * que fazer além de mapear o plano para um tipo de ação.
 *
 * Nesta fase nenhuma ação é de fato executada pela interface — o roteiro
 * fixo continua respondendo por tudo que a candidata vê. Este módulo só
 * calcula qual seria a ação, para os logs/diagnóstico.
 *
 * Este módulo NÃO tem nenhuma relação com o mecanismo de reação por IA já
 * existente (`sofia-reagir` / Fase D) — são coisas completamente separadas.
 */
import type { Action, ConversationStateSnapshot, Plan, SofiaContext } from "./types"

export function decideAction(plan: Plan, state: ConversationStateSnapshot, context: SofiaContext): Action {
  if (state.status !== "em_andamento") {
    return { type: "FINALIZAR", reason: `Conversa com status "${state.status}".` }
  }

  if (state.fase === "submitting") {
    return { type: "AGUARDAR", reason: "Aguardando o processamento final da candidatura." }
  }

  if (context.duvidasAbertas.length > 0) {
    return {
      type: "RESPONDER_DUVIDA",
      reason: `${context.duvidasAbertas.length} dúvida(s) em aberto (detecção ainda não implementada nesta fase).`,
    }
  }

  if (plan.prontoParaFinalizar) {
    return {
      type: "CONTINUAR",
      reason: "Todos os objetivos rastreados foram concluídos; o roteiro fixo decide o encerramento.",
    }
  }

  if (plan.proximoObjetivo) {
    return { type: "PERGUNTAR", target: plan.proximoObjetivo.id, reason: plan.motivoPrioridade }
  }

  return { type: "OBSERVAR", reason: "Nenhuma ação aplicável nesta fase." }
}
