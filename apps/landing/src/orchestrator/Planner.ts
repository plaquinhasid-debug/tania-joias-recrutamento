/**
 * Planner (RFC-002, fase 1).
 *
 * Só diagnostica o estado atual da conversa — nunca escolhe a próxima
 * pergunta nem qualquer outra ação. Fases futuras podem usar este
 * diagnóstico como entrada para decidir o próximo passo de verdade.
 */
import type { ConversationStateSnapshot, PlannerDiagnosis } from "./types"

export function diagnose(state: ConversationStateSnapshot): PlannerDiagnosis {
  const total = state.objetivosConcluidos.length + state.objetivosPendentes.length
  const progresso = total > 0 ? Math.round((state.objetivosConcluidos.length / total) * 100) : 0

  return {
    objetivosConcluidos: state.objetivosConcluidos,
    objetivosPendentes: state.objetivosPendentes,
    progresso,
    prontoParaFinalizar: state.objetivosPendentes.length === 0,
  }
}

/** Formata o diagnóstico como texto legível — só para os logs de desenvolvimento. */
export function formatDiagnosis(diagnosis: PlannerDiagnosis): string {
  const linhas: string[] = []
  linhas.push(`Objetivos concluídos (${diagnosis.objetivosConcluidos.length}):`)
  for (const objetivo of diagnosis.objetivosConcluidos) {
    linhas.push(`  ✔ ${objetivo.label}`)
  }
  linhas.push(`Objetivos pendentes (${diagnosis.objetivosPendentes.length}):`)
  for (const objetivo of diagnosis.objetivosPendentes) {
    linhas.push(`  • ${objetivo.label}`)
  }
  linhas.push(`Progresso: ${diagnosis.progresso}%`)
  return linhas.join("\n")
}
