/**
 * FEATURE-005, Parte 2, Objetivo 7 / testes 21-22 — confirma que o
 * `NaturalConversationEngine` (Parte 3) respeita `canFillCurrentField`
 * vindo do classificador contextual (Parte 2).
 */
import { classifyCandidateMessageContextual } from "../classifyCandidateMessageContextual"
import { buildNaturalReaction } from "./NaturalConversationEngine"

export interface ContextualEngineExampleResult {
  name: string
  passou: boolean
  detalhe: string
}

export function runNaturalConversationEngineContextualExamples(): ContextualEngineExampleResult[] {
  const resultados: ContextualEngineExampleResult[] = []

  // 21. Não reage quando canFillCurrentField é falso — "Tenho pouco tempo"
  // em `cidade` (OBJECTION fora de campo compatível).
  const classificacaoIncompativel = classifyCandidateMessageContextual({
    message: "Tenho pouco tempo.",
    currentFieldKey: "cidade",
    currentQuestion: "Em qual cidade você mora?",
  })
  const reacao21 = buildNaturalReaction({
    fieldKey: "cidade",
    currentQuestion: "Em qual cidade você mora?",
    candidateAnswer: "Tenho pouco tempo.",
    classification: classificacaoIncompativel.kind,
    knownContext: {},
    canFillCurrentField: classificacaoIncompativel.canFillCurrentField,
  }).reaction
  resultados.push({
    name: "21. Engine não reage quando canFillCurrentField=false",
    passou: reacao21.shouldReact === false,
    detalhe: `canFillCurrentField=${classificacaoIncompativel.canFillCurrentField} shouldReact=${reacao21.shouldReact}`,
  })

  // 22. Reage conforme a estratégia quando a resposta é compatível — "Tenho
  // pouco tempo" em `tempo_disponivel` (estratégia AI nesse campo).
  const classificacaoCompativel = classifyCandidateMessageContextual({
    message: "Tenho pouco tempo.",
    currentFieldKey: "tempo_disponivel",
    currentQuestion: "Quanto tempo você pode dedicar por dia?",
  })
  const reacao22 = buildNaturalReaction({
    fieldKey: "tempo_disponivel",
    currentQuestion: "Quanto tempo você pode dedicar por dia?",
    candidateAnswer: "Tenho pouco tempo.",
    classification: classificacaoCompativel.kind,
    knownContext: {},
    canFillCurrentField: classificacaoCompativel.canFillCurrentField,
  }).reaction
  resultados.push({
    name: "22. Engine reage conforme a estratégia quando compatível (AI, sem chamar IA de verdade)",
    passou: reacao22.shouldReact === true && reacao22.strategy === "AI",
    detalhe: `canFillCurrentField=${classificacaoCompativel.canFillCurrentField} shouldReact=${reacao22.shouldReact} strategy=${reacao22.strategy}`,
  })

  return resultados
}
