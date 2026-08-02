/**
 * ConversationSimulator (RFC-007 / RFC-008).
 *
 * Laboratório interno para testar o Lamin Agent Core sem depender da Landing
 * Page. Roda uma conversa completa alimentando o `SofiaOrchestrator` REAL —
 * o mesmo módulo usado em produção — turno a turno, e grava tudo que ele
 * devolve numa `SimulationResult`. Não reimplementa nenhuma lógica de
 * decisão: só chama o pipeline existente e observa.
 *
 * Uso apenas em desenvolvimento (scripts, testes automatizados futuros,
 * REPL). Nunca é importado pela Landing, pelo Admin ou por qualquer Edge
 * Function — de propósito não está no barrel `orchestrator/index.ts`.
 *
 * ## RFC-008: um objetivo só é preenchido com `answer` explícito
 *
 * A RFC-007 presumia que toda mensagem preenchia o próximo objetivo
 * pendente do roteiro — o que contaminava o Context quando a mensagem era
 * na verdade uma pergunta, objeção, dúvida, saudação ou despedida. Agora o
 * `SimulationInputTurn.answer` é a ÚNICA fonte que altera o Context; o texto
 * da mensagem em si só é usado para classificação de intenção
 * (`IntentClassifier`, dentro do Orchestrator) e para os logs — nunca para
 * inferir automaticamente que campo ela preenche.
 */
import type { SofiaAnswers, SofiaPhase } from "@/types/sofia"
import { createLogger } from "../devLog"
import { evaluateObjectives, OBJECTIVES } from "../Objectives"
import { SofiaOrchestrator } from "../SofiaOrchestrator"
import type { ConversationEvent, ConversationOutcome, DecisionType, IntentType, ObjectiveStatus } from "../types"
import type {
  ContextIntegrityError,
  ExpectedIntentMismatch,
  ObjectiveKey,
  ScenarioAssertionDiff,
  ScenarioDefinition,
  ScenarioExpectation,
  ScenarioRunResult,
  SimulationError,
  SimulationInputTurn,
  SimulationResult,
  SimulationTurn,
} from "./types"

const log = createLogger("[Simulator]")

/** Intenções que fazem sentido "responder" um objetivo do roteiro — o resto é sinal de que um `answer` foi declarado no lugar errado. */
const INTENTS_COMPATIVEIS_COM_RESPOSTA: readonly IntentType[] = ["ANSWER", "CONFIRMATION", "NEGATION"]

interface ApplyAnswerResult {
  answers: SofiaAnswers
  /** Presente quando o `value` não bate com o tipo esperado para este objetivo — nesse caso `answers` volta inalterado. */
  erroTipo?: string
}

/**
 * Aplica um `answer` explícito ao `SofiaAnswers` acumulado. Só muta o campo
 * correspondente ao objetivo declarado — nunca "adivinha" qual campo based
 * no conteúdo da mensagem (essa é exatamente a contaminação que a RFC-008
 * corrige).
 */
function applyAnswer(answers: SofiaAnswers, objective: ObjectiveKey, value: unknown): ApplyAnswerResult {
  switch (objective) {
    case "nome":
      if (typeof value !== "string") return { answers, erroTipo: `esperava string, recebeu ${typeof value}` }
      return { answers: { ...answers, nome: value } }
    case "cidade":
      if (typeof value !== "string") return { answers, erroTipo: `esperava string, recebeu ${typeof value}` }
      return { answers: { ...answers, cidade: value } }
    case "profissao":
      if (typeof value !== "string") return { answers, erroTipo: `esperava string, recebeu ${typeof value}` }
      return { answers: { ...answers, profissao: value } }
    case "empresa":
      if (typeof value !== "string") return { answers, erroTipo: `esperava string, recebeu ${typeof value}` }
      return { answers: { ...answers, empresa_atual: value } }
    case "experiencia":
      if (typeof value !== "boolean") return { answers, erroTipo: `esperava boolean, recebeu ${typeof value}` }
      return { answers: { ...answers, experiencia_vendas: value } }
    case "instagram":
      if (value !== null && typeof value !== "string") {
        return { answers, erroTipo: `esperava string ou null, recebeu ${typeof value}` }
      }
      return { answers: { ...answers, possui_instagram: value !== null, instagram: value as string | null } }
    case "whatsapp":
      if (typeof value !== "boolean") return { answers, erroTipo: `esperava boolean, recebeu ${typeof value}` }
      return { answers: { ...answers, whatsapp: value } }
    case "motivacao":
      if (typeof value !== "string") return { answers, erroTipo: `esperava string, recebeu ${typeof value}` }
      return { answers: { ...answers, objetivo: value } }
    case "tempo":
      if (typeof value !== "string") return { answers, erroTipo: `esperava string, recebeu ${typeof value}` }
      return { answers: { ...answers, tempo_disponivel: value } }
    default:
      return { answers }
  }
}

function arraysEqual<T>(a: T[], b: T[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

function setsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const setB = new Set(b)
  return a.every((v) => setB.has(v))
}

let simulatedSessionCounter = 0

export class ConversationSimulator {
  private readonly sessionId: string
  private readonly orchestrator: SofiaOrchestrator
  private answers: SofiaAnswers = {}
  private readonly fase: SofiaPhase = "asking"

  constructor(sessionId?: string) {
    this.sessionId = sessionId ?? `simulacao-${Date.now()}-${++simulatedSessionCounter}`
    this.orchestrator = new SofiaOrchestrator(this.sessionId)
  }

  /** Processa uma lista de turnos estruturados, um por vez, no mesmo pipeline do Orchestrator real. */
  run(turns: SimulationInputTurn[], cenario?: string): SimulationResult {
    const inicio = Date.now()
    log("Início", { sessionId: this.sessionId, cenario, totalTurnos: turns.length })

    const timeline: SimulationTurn[] = []
    const errors: SimulationError[] = []
    const contextIntegrityErrors: ContextIntegrityError[] = []
    const expectedIntentMismatches: ExpectedIntentMismatch[] = []
    const objetivosDeclarados = new Set<ObjectiveKey>()

    turns.forEach((turnoEntrada, index) => {
      const turno = index + 1
      const turnStart = Date.now()
      log(`Turno ${turno}/${turns.length}:`, turnoEntrada.message)

      try {
        if (turnoEntrada.answer) {
          objetivosDeclarados.add(turnoEntrada.answer.objective)

          const { answers, erroTipo } = applyAnswer(this.answers, turnoEntrada.answer.objective, turnoEntrada.answer.value)
          this.answers = answers

          if (erroTipo) {
            contextIntegrityErrors.push({
              turno,
              tipo: "TIPO_INCOMPATIVEL",
              objective: turnoEntrada.answer.objective,
              mensagem: turnoEntrada.message,
              detalhe: erroTipo,
            })
          }
        }

        const evento: ConversationEvent = {
          type: "user_answer",
          campo: turnoEntrada.answer?.objective ?? "mensagem_livre",
          valor: turnoEntrada.message,
        }

        const action = this.orchestrator.processTurn(evento, { fase: this.fase, answers: this.answers })
        const tempoMs = Date.now() - turnStart
        const intent = this.orchestrator.getIntent()

        if (turnoEntrada.answer && !INTENTS_COMPATIVEIS_COM_RESPOSTA.includes(intent.type)) {
          contextIntegrityErrors.push({
            turno,
            tipo: "INTENT_INCOMPATIVEL_COM_RESPOSTA",
            objective: turnoEntrada.answer.objective,
            mensagem: turnoEntrada.message,
            detalhe: `Turno declarou answer para "${turnoEntrada.answer.objective}", mas o IntentClassifier classificou a mensagem como ${intent.type}, não como resposta.`,
          })
        }

        if (turnoEntrada.expectedIntent && turnoEntrada.expectedIntent !== intent.type) {
          expectedIntentMismatches.push({
            turno,
            mensagem: turnoEntrada.message,
            esperado: turnoEntrada.expectedIntent,
            obtido: intent.type,
          })
        }

        timeline.push({
          turno,
          mensagem: turnoEntrada.message,
          turnoEntrada,
          evento,
          estado: this.orchestrator.getState(),
          contexto: this.orchestrator.getContext(),
          objetivos: evaluateObjectives(this.orchestrator.getContext()),
          plano: this.orchestrator.getPlan(),
          intent,
          decision: this.orchestrator.getDecision(),
          action,
          tempoMs,
        })

        log(`Tempo: ${tempoMs}ms`)
      } catch (err) {
        const mensagemErro = err instanceof Error ? err.message : String(err)
        log(`Erro no turno ${turno} (interrompe só este turno, simulação continua):`, mensagemErro)
        errors.push({ turno, mensagem: turnoEntrada.message, erro: mensagemErro })
      }
    })

    const contextoFinal = this.orchestrator.getContext()
    const avaliacaoFinal = evaluateObjectives(contextoFinal)

    for (const objetivo of avaliacaoFinal.concluidos) {
      if (!objetivosDeclarados.has(objetivo.id)) {
        contextIntegrityErrors.push({
          turno: -1,
          tipo: "OBJETIVO_SEM_ANSWER_EXPLICITO",
          objective: objetivo.id,
          mensagem: "(auditoria de fim de execução)",
          detalhe: `Objetivo "${objetivo.label}" está concluído no Context, mas nenhum turno declarou um answer para ele.`,
        })
      }
    }

    const executionTimeMs = Date.now() - inicio

    const ultimaFinalizacao = [...timeline].reverse().find((t) => t.decision.type === "FINALIZE")
    const outcome: ConversationOutcome =
      ultimaFinalizacao?.decision.outcome ?? (errors.length > 0 ? "FAILED" : "IN_PROGRESS")

    const objetivosObrigatorios = new Set(OBJECTIVES.filter((o) => o.required).map((o) => o.id))
    const completedRequiredObjectives: ObjectiveStatus[] = avaliacaoFinal.concluidos.filter((o) =>
      objetivosObrigatorios.has(o.id),
    )
    const pendingRequiredObjectives: ObjectiveStatus[] = avaliacaoFinal.pendentes.filter((o) =>
      objetivosObrigatorios.has(o.id),
    )

    const result: SimulationResult = {
      sessionId: this.sessionId,
      cenario,
      turnosEntrada: turns,
      messages: turns.map((t) => t.message),
      timeline,
      events: timeline.map((t) => t.evento),
      plans: timeline.map((t) => t.plano),
      intents: timeline.map((t) => t.intent),
      decisions: timeline.map((t) => t.decision),
      actions: timeline.map((t) => t.action),
      executionTimeMs,
      errors,
      outcome,
      completedRequiredObjectives,
      pendingRequiredObjectives,
      contextIntegrityErrors,
      expectedIntentMismatches,
    }

    log("Fim", {
      turnos: timeline.length,
      erros: errors.length,
      integridade: contextIntegrityErrors.length,
      outcome,
      tempoTotalMs: executionTimeMs,
    })
    log("Resultado:", result)

    return result
  }

  getOrchestrator(): SofiaOrchestrator {
    return this.orchestrator
  }
}

/**
 * Exporta a timeline de uma simulação como JSON — hoje só isso; uma RFC
 * futura pode adicionar exportadores para PDF/HTML sem precisar mudar o
 * Simulator (basta ler o mesmo `SimulationResult`).
 */
export function exportTimeline(result: SimulationResult): string {
  return JSON.stringify(result, null, 2)
}

/**
 * Atalho para rodar uma lista de turnos completa de uma vez — pensado para
 * ser reaproveitado por testes automatizados futuros.
 */
export function runScenario(turns: SimulationInputTurn[], cenario?: string, sessionId?: string): SimulationResult {
  const simulator = new ConversationSimulator(sessionId)
  return simulator.run(turns, cenario)
}

/**
 * Compatibilidade com cenários antigos (`string[]`, RFC-007): converte cada
 * mensagem num `SimulationInputTurn` sem `answer` — ou seja, nenhuma
 * preenche objetivo automaticamente. Serve só de ponte; os 5 cenários de
 * demonstração já foram todos reescritos como `SimulationInputTurn[]`
 * (RFC-008) e não passam mais por aqui.
 */
export function legacyStringScenarioAdapter(messages: string[]): SimulationInputTurn[] {
  return messages.map((message) => ({ message }))
}

function diffExpectation(expected: ScenarioExpectation, result: SimulationResult): ScenarioAssertionDiff[] {
  const diffs: ScenarioAssertionDiff[] = []

  if (expected.outcome !== undefined && expected.outcome !== result.outcome) {
    diffs.push({ campo: "outcome", esperado: expected.outcome, obtido: result.outcome })
  }

  if (expected.intents !== undefined) {
    const obtido: IntentType[] = result.intents.map((i) => i.type)
    if (!arraysEqual(expected.intents, obtido)) {
      diffs.push({ campo: "intents", esperado: expected.intents, obtido })
    }
  }

  if (expected.decisions !== undefined) {
    const obtido: DecisionType[] = result.decisions.map((d) => d.type)
    if (!arraysEqual(expected.decisions, obtido)) {
      diffs.push({ campo: "decisions", esperado: expected.decisions, obtido })
    }
  }

  const ultimoTurno = result.timeline.at(-1)

  if (expected.completedObjectives !== undefined) {
    const obtido = ultimoTurno ? ultimoTurno.objetivos.concluidos.map((o) => o.id) : []
    if (!setsEqual(expected.completedObjectives, obtido)) {
      diffs.push({ campo: "completedObjectives", esperado: expected.completedObjectives, obtido })
    }
  }

  if (expected.pendingObjectives !== undefined) {
    const obtido = ultimoTurno ? ultimoTurno.objetivos.pendentes.map((o) => o.id) : []
    if (!setsEqual(expected.pendingObjectives, obtido)) {
      diffs.push({ campo: "pendingObjectives", esperado: expected.pendingObjectives, obtido })
    }
  }

  return diffs
}

/**
 * Roda um `ScenarioDefinition` completo e confere o resultado contra
 * `expected`, quando declarado. Nunca lança exceção por causa de uma
 * divergência — só registra em `diffs` (RFC-008, Objetivo 9).
 */
export function runScenarioDefinition(definition: ScenarioDefinition, sessionId?: string): ScenarioRunResult {
  const result = runScenario(definition.turns, definition.name, sessionId)
  const diffs = definition.expected ? diffExpectation(definition.expected, result) : []

  if (diffs.length > 0) {
    log(`Cenário "${definition.name}": ${diffs.length} diferença(s) entre esperado e obtido:`, diffs)
  } else if (definition.expected) {
    log(`Cenário "${definition.name}": resultado bate com o esperado.`)
  }

  return { result, diffs }
}
