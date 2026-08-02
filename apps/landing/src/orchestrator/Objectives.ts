/**
 * Objetivos de coleta de informação da conversa (RFC-002 / RFC-003).
 *
 * Espelham os dados que o roteiro atual (`sofia-script.ts`) já coleta — não
 * introduzem nenhuma pergunta nova, só nomeiam o que já existe para o
 * Orquestrador acompanhar. Nesta fase eles apenas REGISTRAM se a informação
 * já foi descoberta (avaliada a partir do `Context`); não controlam a
 * conversa.
 *
 * A ORDEM deste array é usada pelo Planner (RFC-003) como ordem de
 * prioridade — espelha a ordem real de `sofia-script.ts`. Isso é uma
 * duplicação deliberada e de baixo custo (só uma lista), documentada aqui
 * de propósito: se a ordem do roteiro mudar no futuro sem atualizar aqui
 * também, o Plano do Planner passa a divergir silenciosamente da conversa
 * real nos logs (não quebra nada, só fica enganoso).
 *
 * Não cobre `idade`, `telefone` e `trabalha` — são campos de
 * identificação/gate, não "objetivos de qualificação" de negócio (decisão
 * confirmada na RFC-003).
 */
import type { Objective, ObjectiveStatus, SofiaContext } from "./types"

/**
 * `required`/`priority` foram adicionados na RFC-008 para preparar a
 * arquitetura (ver `Objective` em `types.ts`) — nesta fase TODOS os
 * objetivos continuam obrigatórios (`required: true`), então o
 * comportamento de "conversa completa" não muda: ainda exige os 9. Só uma
 * RFC futura que decidir tornar algum objetivo opcional mudaria isso aqui.
 * `priority` só torna explícito o que já era implícito (a ordem do array).
 */
export const OBJECTIVES: readonly Objective[] = [
  { id: "nome", label: "Nome", isComplete: (c) => Boolean(c.nome?.trim()), required: true, priority: 1 },
  { id: "cidade", label: "Cidade", isComplete: (c) => Boolean(c.cidade?.trim()), required: true, priority: 2 },
  {
    id: "profissao",
    label: "Profissão",
    isComplete: (c) => Boolean(c.profissao?.trim()),
    required: true,
    priority: 3,
  },
  {
    id: "empresa",
    label: "Empresa",
    isComplete: (c) => Boolean(c.empresaAtual?.trim()),
    required: true,
    priority: 4,
  },
  {
    id: "experiencia",
    label: "Experiência com vendas",
    isComplete: (c) => c.experienciaVendas !== undefined,
    required: true,
    priority: 5,
  },
  {
    id: "instagram",
    label: "Instagram",
    isComplete: (c) => c.possuiInstagram !== undefined,
    required: true,
    priority: 6,
  },
  { id: "whatsapp", label: "WhatsApp", isComplete: (c) => c.whatsapp !== undefined, required: true, priority: 7 },
  {
    id: "motivacao",
    label: "Motivação",
    isComplete: (c) => Boolean(c.motivacao?.trim()),
    required: true,
    priority: 8,
  },
  {
    id: "tempo",
    label: "Tempo disponível",
    isComplete: (c) => Boolean(c.tempoDisponivel?.trim()),
    required: true,
    priority: 9,
  },
] as const

export interface ObjectivesEvaluation {
  concluidos: ObjectiveStatus[]
  /** Em ordem de prioridade (mesma ordem de `OBJECTIVES`). */
  pendentes: ObjectiveStatus[]
}

/** Avalia todos os objetivos contra o Contexto atual da conversa. */
export function evaluateObjectives(context: SofiaContext): ObjectivesEvaluation {
  const concluidos: ObjectiveStatus[] = []
  const pendentes: ObjectiveStatus[] = []

  for (const objective of OBJECTIVES) {
    const status: ObjectiveStatus = {
      id: objective.id,
      label: objective.label,
      complete: objective.isComplete(context),
      required: objective.required,
    }
    if (status.complete) {
      concluidos.push(status)
    } else {
      pendentes.push(status)
    }
  }

  return { concluidos, pendentes }
}
