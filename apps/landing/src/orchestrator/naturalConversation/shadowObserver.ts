/**
 * FEATURE-005, Parte 4 (+ Parte 5: modo por injeção) — ponte SHADOW entre o
 * classificador contextual (Parte 2) + `NaturalConversationEngine` (Parte 3)
 * e o fluxo real da Sofia (`useSofiaFlow.ts`). Único arquivo importado pelo
 * hook de produção — por isso é também o único ponto de entrada, pra manter
 * o "raio de explosão" de qualquer bug aqui contido num lugar só.
 *
 * Contrato de segurança (por que isto NUNCA pode afetar a candidata):
 *  - `observeShadowTurn()` nunca lança — qualquer erro interno cai no
 *    catch e devolve `null`.
 *  - Não retorna nada que o chamador possa usar pra alterar o fluxo (só um
 *    objeto de observação, puramente informativo).
 *  - Não chama IA, não chama rede, não grava nada (Supabase, Edge Function
 *    etc.) — só classifica texto e monta uma reação em memória.
 *  - Este módulo NÃO consulta o Supabase — o modo (`"OFF" | "SHADOW"`,
 *    já resolvido a partir do valor real do setting) vem por injeção, via
 *    `input.mode` (Objetivo 4 da Parte 5). Quem busca a config e resolve
 *    `ACTIVE` → `SHADOW` é `resolveNaturalConversationMode`
 *    (`resolveMode.ts`), chamado por `useSofiaFlow.ts`.
 */
import { classifyCandidateMessage, type CandidateMessageKind } from "../classifyCandidateMessage"
import { classifyCandidateMessageContextual } from "../classifyCandidateMessageContextual"
import { buildNaturalReaction } from "./NaturalConversationEngine"
import type { EffectiveNaturalConversationMode } from "./resolveMode"
import type { ReactionStrategy } from "./types"

export type ShadowDivergenceCode =
  | "NON_ANSWER_ACCEPTED_BY_CURRENT_FLOW"
  | "ANSWER_REJECTED_BY_CURRENT_FLOW"
  | "NON_ANSWER_ADVANCED_CURRENT_FLOW"
  | "CLASSIFIER_DISAGREEMENT"

/**
 * Objetivo 5 — deliberadamente SEM nenhum dado pessoal: nunca inclui o
 * texto da resposta, nome, telefone ou Instagram, só metadados.
 */
export interface NaturalConversationShadowObservation {
  sessionId: string
  fieldKey: string
  classification: {
    kind: CandidateMessageKind
    confidence: number
    reasonCode: string
    canFillCurrentField: boolean
  }
  reaction?: {
    shouldReact: boolean
    strategy: ReactionStrategy
    acknowledgment?: string
    transition?: string
  }
  currentFlowAcceptedAnswer: boolean
  currentFlowAdvanced: boolean
  timestamp: string
  divergences: ShadowDivergenceCode[]
}

export interface ObserveShadowTurnInput {
  sessionId: string
  fieldKey: string
  currentQuestion: string
  nextQuestion?: string
  candidateAnswer: string
  /** O que o fluxo REAL decidiu fazer com esta resposta (já calculado por quem chama). */
  currentFlowAcceptedAnswer: boolean
  knownContext: Record<string, unknown>
}

/**
 * Lógica pura, sem o gate de modo — separada só pra ser testável sem
 * precisar simular o modo toda hora (usada pelos exemplos/testes).
 * `observeShadowTurn()` (abaixo) é o único ponto que o `useSofiaFlow.ts`
 * de produção chama, e É esse que respeita o modo (recebido por injeção).
 */
export function computeShadowObservation(input: ObserveShadowTurnInput): NaturalConversationShadowObservation | null {
  try {
    const classification = classifyCandidateMessageContextual({
      message: input.candidateAnswer,
      currentFieldKey: input.fieldKey,
      currentQuestion: input.currentQuestion,
    })

    const reaction = buildNaturalReaction({
      fieldKey: input.fieldKey,
      currentQuestion: input.currentQuestion,
      candidateAnswer: input.candidateAnswer,
      classification: classification.kind,
      knownContext: input.knownContext,
      canFillCurrentField: classification.canFillCurrentField,
    }).reaction

    // Comparação com o classificador simples da Parte 1 — só pra detectar
    // CLASSIFIER_DISAGREEMENT (Objetivo 7); nunca usado pra decidir nada.
    const legacyKind = classifyCandidateMessage(input.candidateAnswer)

    // Simplificação documentada (Objetivo 7): neste código, hoje, uma
    // resposta aceita SEMPRE avança a etapa (não existe caso de "aceitou
    // mas não avançou") — então `currentFlowAdvanced` espelha
    // `currentFlowAcceptedAnswer`. Se isso deixar de ser verdade no futuro
    // (ex.: um novo tipo de pausa que aceita sem avançar), este cálculo
    // precisa ser revisto.
    const currentFlowAdvanced = input.currentFlowAcceptedAnswer

    const classifierDizResposta = classification.kind === "ANSWER" && classification.canFillCurrentField
    const divergences: ShadowDivergenceCode[] = []
    if (!classifierDizResposta && input.currentFlowAcceptedAnswer) {
      divergences.push("NON_ANSWER_ACCEPTED_BY_CURRENT_FLOW", "NON_ANSWER_ADVANCED_CURRENT_FLOW")
    }
    if (classifierDizResposta && !input.currentFlowAcceptedAnswer) {
      divergences.push("ANSWER_REJECTED_BY_CURRENT_FLOW")
    }
    if (legacyKind !== classification.kind) {
      divergences.push("CLASSIFIER_DISAGREEMENT")
    }

    const observation: NaturalConversationShadowObservation = {
      sessionId: input.sessionId,
      fieldKey: input.fieldKey,
      classification: {
        kind: classification.kind,
        confidence: classification.confidence,
        reasonCode: classification.reasonCode,
        canFillCurrentField: classification.canFillCurrentField,
      },
      reaction: {
        shouldReact: reaction.shouldReact,
        strategy: reaction.strategy,
        acknowledgment: reaction.acknowledgment,
        transition: reaction.transition,
      },
      currentFlowAcceptedAnswer: input.currentFlowAcceptedAnswer,
      currentFlowAdvanced,
      timestamp: new Date().toISOString(),
      divergences,
    }

    // Objetivo 6: log só em dev, sem texto completo da candidata nem
    // qualquer dado pessoal — só os 7 campos pedidos + divergências.
    if (import.meta.env.DEV) {
      console.debug("[NaturalConversation][Shadow]", {
        campo: observation.fieldKey,
        classificacao: observation.classification.kind,
        confianca: observation.classification.confidence,
        podePreencher: observation.classification.canFillCurrentField,
        fluxoAtualAceitou: observation.currentFlowAcceptedAnswer,
        fluxoAtualAvancou: observation.currentFlowAdvanced,
        estrategiaReacao: observation.reaction?.strategy,
        divergencias: observation.divergences,
      })
    }

    return observation
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn("[NaturalConversation][Shadow] falha ao observar (nunca deve afetar o fluxo real)", err)
    }
    return null
  }
}

export interface ObserveShadowTurnWithModeInput extends ObserveShadowTurnInput {
  /** Modo já resolvido (Parte 5) — este módulo nunca decide isso sozinho. */
  mode: EffectiveNaturalConversationMode
}

/**
 * Objetivo 2+3 (Parte 4) / Objetivo 4 (Parte 5) — ponto de entrada real (o
 * único que `useSofiaFlow.ts` chama): aplica o gate de modo (`"OFF"` não
 * faz nada) e delega o resto pra `computeShadowObservation`. O modo vem por
 * injeção (`input.mode`), nunca de uma constante interna deste módulo.
 */
export function observeShadowTurn(input: ObserveShadowTurnWithModeInput): NaturalConversationShadowObservation | null {
  if (input.mode !== "SHADOW") return null
  return computeShadowObservation(input)
}
