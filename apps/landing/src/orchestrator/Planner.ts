/**
 * Planner (RFC-003).
 *
 * "O Planner pensa": analisa os objetivos avaliados (que já refletem o
 * Contexto atual) e produz um PLANO — não mais um relatório simples. O
 * Planner NUNCA executa nada; quem transforma o plano numa ação estruturada
 * é o `ActionEngine`.
 *
 * A prioridade usada para escolher o "próximo objetivo" é a ORDEM do array
 * `OBJECTIVES` (ver `Objectives.ts`), que espelha a ordem real do roteiro —
 * inteiramente determinístico, sem IA nesta fase.
 */
import type { ObjectivesEvaluation } from "./Objectives"
import type { Plan } from "./types"

export function createPlan(evaluation: ObjectivesEvaluation): Plan {
  const { concluidos, pendentes } = evaluation
  const [proximoObjetivo = null, ...objetivosFuturos] = pendentes

  const total = concluidos.length + pendentes.length
  const progresso = total > 0 ? Math.round((concluidos.length / total) * 100) : 0

  const observacoes: string[] = []
  if (pendentes.length === 0) {
    observacoes.push("Todos os objetivos rastreados já foram concluídos.")
  }

  const motivoPrioridade = proximoObjetivo
    ? `Segue a ordem padrão de coleta do roteiro; "${proximoObjetivo.label}" é o próximo objetivo ainda não concluído.`
    : "Não há objetivos pendentes — não há próximo item a priorizar."

  return {
    proximoObjetivo,
    objetivosFuturos,
    itensPendentes: pendentes,
    objetivosConcluidos: concluidos,
    motivoPrioridade,
    observacoes,
    progresso,
    prontoParaFinalizar: pendentes.length === 0,
  }
}

/** Formata o plano como texto legível — só para os logs de desenvolvimento. */
export function formatPlan(plan: Plan): string {
  const linhas: string[] = []
  linhas.push(`Próximo objetivo: ${plan.proximoObjetivo ? plan.proximoObjetivo.label : "(nenhum)"}`)
  linhas.push(`Motivo da prioridade: ${plan.motivoPrioridade}`)
  linhas.push(`Objetivos futuros (${plan.objetivosFuturos.length}):`)
  for (const objetivo of plan.objetivosFuturos) {
    linhas.push(`  • ${objetivo.label}`)
  }
  linhas.push(`Objetivos concluídos (${plan.objetivosConcluidos.length}):`)
  for (const objetivo of plan.objetivosConcluidos) {
    linhas.push(`  ✔ ${objetivo.label}`)
  }
  if (plan.observacoes.length > 0) {
    linhas.push("Observações:")
    for (const observacao of plan.observacoes) {
      linhas.push(`  - ${observacao}`)
    }
  }
  linhas.push(`Progresso: ${plan.progresso}%`)
  return linhas.join("\n")
}
