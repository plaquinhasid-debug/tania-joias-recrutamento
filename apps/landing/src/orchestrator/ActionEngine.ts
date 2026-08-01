/**
 * ActionEngine (RFC-003 → RFC-005).
 *
 * Mudança de responsabilidade na RFC-005: até a RFC-003, este módulo
 * decidia sozinho o que fazer a partir do Plano. A partir da RFC-005,
 * DECIDIR passou a ser trabalho do `DecisionEngine` (com base na Intenção
 * classificada) — o ActionEngine só EXECUTA a Decisão recebida, ou seja,
 * resolve os detalhes concretos que faltam pra ela virar uma Ação pronta.
 *
 * Nesta fase o único detalhe que precisa ser resolvido é o `target` de um
 * `CONTINUE_FLOW` (qual objetivo perguntar a seguir) — lido do Plano, já
 * que a Decision em si não carrega isso (ver RFC-005). Para os demais tipos
 * de decisão, a Ação é essencially a Decisão repassada adiante.
 *
 * Continua sem consultar IA, banco ou Tool — e sem nenhuma relação com o
 * mecanismo de reação por IA já existente (`sofia-reagir` / Fase D).
 */
import type { Action, Decision, Plan } from "./types"

export function executeDecision(decision: Decision, plan: Plan): Action {
  if (decision.type === "CONTINUE_FLOW" && plan.proximoObjetivo) {
    return {
      type: decision.type,
      reason: decision.reason,
      target: plan.proximoObjetivo.id,
      metadata: decision.metadata,
    }
  }

  return {
    type: decision.type,
    reason: decision.reason,
    metadata: decision.metadata,
  }
}
