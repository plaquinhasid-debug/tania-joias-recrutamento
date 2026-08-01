/**
 * ConversationSimulator (RFC-007).
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
 * ## Como as mensagens viram respostas
 *
 * O simulador não sabe, a priori, "que pergunta" cada mensagem do cenário
 * responde — assim como a Sofia real, ele preenche o PRÓXIMO objetivo
 * pendente do Plano (`plano.proximoObjetivo`) com o texto recebido. Isso
 * espelha o comportamento real: uma mensagem pode preencher um campo do
 * roteiro (ex.: "Sou cabeleireira" → profissão) mesmo quando o CONTEÚDO da
 * mensagem é uma objeção ou dúvida — a classificação de intenção (feita
 * pelo `IntentClassifier` de verdade, dentro do Orchestrator) é sempre sobre
 * o texto em si, não sobre qual campo ele preencheu. Esse comportamento já
 * foi observado e confirmado manualmente na RFC-005.
 *
 * Campos booleanos do roteiro (`experiencia_vendas`, `whatsapp`,
 * `possui_instagram`) não têm como ser inferidos com segurança de um texto
 * livre sem IA — o simulador usa uma heurística simples e deliberadamente
 * ingênua (`pareceNegativa`, só verifica negação explícita) só para decidir
 * `true`/`false`. É uma simplificação do LABORATÓRIO, não da Sofia real (que
 * nesta fase nem usa isso — a Landing continua coletando esses campos via
 * botões sim/não do roteiro, não texto livre).
 */
import type { SofiaAnswers, SofiaPhase } from "@/types/sofia"
import { createLogger } from "../devLog"
import { evaluateObjectives } from "../Objectives"
import { SofiaOrchestrator } from "../SofiaOrchestrator"
import type { ConversationEvent, ObjectiveId } from "../types"
import type { SimulationError, SimulationResult, SimulationTurn } from "./types"

const log = createLogger("[Simulator]")

const NEGATION_MARKERS = ["nao", "não", "nunca", "jamais"]

function pareceNegativa(mensagem: string): boolean {
  const texto = mensagem
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
  return NEGATION_MARKERS.some((m) => texto.includes(m.normalize("NFD").replace(/[̀-ͯ]/g, "")))
}

/**
 * Aplica uma mensagem ao objetivo pendente informado, devolvendo um novo
 * `SofiaAnswers`. Se não houver objetivo pendente (`objectiveId` nulo), as
 * respostas não mudam — a mensagem ainda é processada pelo pipeline (pode
 * virar uma objeção, dúvida, ou encerramento), só não preenche nenhum campo.
 */
function applyAnswer(answers: SofiaAnswers, objectiveId: ObjectiveId | null, mensagem: string): SofiaAnswers {
  if (!objectiveId) return answers

  const afirmativo = !pareceNegativa(mensagem)

  switch (objectiveId) {
    case "nome":
      return { ...answers, nome: mensagem }
    case "cidade":
      return { ...answers, cidade: mensagem }
    case "profissao":
      return { ...answers, profissao: mensagem }
    case "empresa":
      return { ...answers, empresa_atual: mensagem }
    case "experiencia":
      return { ...answers, experiencia_vendas: afirmativo }
    case "instagram":
      return { ...answers, possui_instagram: afirmativo, instagram: afirmativo ? mensagem : null }
    case "whatsapp":
      return { ...answers, whatsapp: afirmativo }
    case "motivacao":
      return { ...answers, objetivo: mensagem }
    case "tempo":
      return { ...answers, tempo_disponivel: mensagem }
    default:
      return answers
  }
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

  /** Processa uma lista de mensagens, uma por vez, no mesmo pipeline do Orchestrator real. */
  run(messages: string[], cenario?: string): SimulationResult {
    const inicio = Date.now()
    log("Início", { sessionId: this.sessionId, cenario, totalMensagens: messages.length })

    const timeline: SimulationTurn[] = []
    const errors: SimulationError[] = []

    messages.forEach((mensagem, index) => {
      const turnStart = Date.now()
      log(`Turno ${index + 1}/${messages.length}:`, mensagem)

      try {
        const objetivoAlvo = this.orchestrator.getPlan().proximoObjetivo?.id ?? null
        this.answers = applyAnswer(this.answers, objetivoAlvo, mensagem)

        const evento: ConversationEvent = {
          type: "user_answer",
          campo: objetivoAlvo ?? "mensagem_livre",
          valor: mensagem,
        }

        const action = this.orchestrator.processTurn(evento, { fase: this.fase, answers: this.answers })
        const tempoMs = Date.now() - turnStart

        timeline.push({
          turno: index + 1,
          mensagem,
          evento,
          estado: this.orchestrator.getState(),
          contexto: this.orchestrator.getContext(),
          objetivos: evaluateObjectives(this.orchestrator.getContext()),
          plano: this.orchestrator.getPlan(),
          intent: this.orchestrator.getIntent(),
          decision: this.orchestrator.getDecision(),
          action,
          tempoMs,
        })

        log(`Tempo: ${tempoMs}ms`)
      } catch (err) {
        const mensagemErro = err instanceof Error ? err.message : String(err)
        log(`Erro no turno ${index + 1} (interrompe só este turno, simulação continua):`, mensagemErro)
        errors.push({ turno: index + 1, mensagem, erro: mensagemErro })
      }
    })

    const executionTimeMs = Date.now() - inicio

    const result: SimulationResult = {
      sessionId: this.sessionId,
      cenario,
      messages,
      timeline,
      events: timeline.map((t) => t.evento),
      plans: timeline.map((t) => t.plano),
      intents: timeline.map((t) => t.intent),
      decisions: timeline.map((t) => t.decision),
      actions: timeline.map((t) => t.action),
      executionTimeMs,
      errors,
    }

    log("Fim", { turnos: timeline.length, erros: errors.length, tempoTotalMs: executionTimeMs })
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
 * Atalho para rodar um cenário completo de uma vez — pensado para ser
 * reaproveitado por testes automatizados futuros (ex.: `expect(runScenario(SCENARIO_OBJECAO).intents).toContain(...)`).
 */
export function runScenario(messages: string[], cenario?: string, sessionId?: string): SimulationResult {
  const simulator = new ConversationSimulator(sessionId)
  return simulator.run(messages, cenario)
}
