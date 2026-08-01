/**
 * Objetivos de coleta de informação da conversa (RFC-002).
 *
 * Espelham os dados que o roteiro atual (`sofia-script.ts`) já coleta — não
 * introduzem nenhuma pergunta nova, só nomeiam o que já existe para o
 * Orquestrador acompanhar. Nesta fase eles apenas REGISTRAM se a informação
 * já foi descoberta; não controlam a conversa.
 *
 * Observação: quando `trabalha === false`, o roteiro pula a maior parte
 * destes objetivos de propósito (não fazem sentido pra quem não trabalha).
 * Nesta fase eles continuam aparecendo como "pendente" nesse caso — o
 * Planner ainda não distingue "pendente" de "não aplicável" (ver RFC-001,
 * gargalo 2, e a seção de próximos passos do relatório desta RFC).
 */
import type { SofiaAnswers } from "@/types/sofia"
import type { Objective, ObjectiveStatus } from "./types"

export const OBJECTIVES: readonly Objective[] = [
  { id: "nome", label: "Nome", isComplete: (a) => Boolean(a.nome?.trim()) },
  { id: "cidade", label: "Cidade", isComplete: (a) => Boolean(a.cidade?.trim()) },
  { id: "profissao", label: "Profissão", isComplete: (a) => Boolean(a.profissao?.trim()) },
  { id: "empresa", label: "Empresa", isComplete: (a) => Boolean(a.empresa_atual?.trim()) },
  {
    id: "experiencia",
    label: "Experiência com vendas",
    isComplete: (a) => a.experiencia_vendas !== undefined,
  },
  { id: "instagram", label: "Instagram", isComplete: (a) => a.possui_instagram !== undefined },
  { id: "whatsapp", label: "WhatsApp", isComplete: (a) => a.whatsapp !== undefined },
  { id: "motivacao", label: "Motivação", isComplete: (a) => Boolean(a.objetivo?.trim()) },
  { id: "tempo", label: "Tempo disponível", isComplete: (a) => Boolean(a.tempo_disponivel?.trim()) },
] as const

export interface ObjectivesEvaluation {
  concluidos: ObjectiveStatus[]
  pendentes: ObjectiveStatus[]
}

/** Avalia todos os objetivos contra as respostas já coletadas na conversa. */
export function evaluateObjectives(answers: SofiaAnswers): ObjectivesEvaluation {
  const concluidos: ObjectiveStatus[] = []
  const pendentes: ObjectiveStatus[] = []

  for (const objective of OBJECTIVES) {
    const status: ObjectiveStatus = {
      id: objective.id,
      label: objective.label,
      complete: objective.isComplete(answers),
    }
    if (status.complete) {
      concluidos.push(status)
    } else {
      pendentes.push(status)
    }
  }

  return { concluidos, pendentes }
}
