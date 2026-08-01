/**
 * SofiaOrchestrator (RFC-002 / RFC-003).
 *
 * O "cérebro" da Sofia em construção. Ele COORDENA os demais módulos — nunca
 * toma decisão de negócio, nunca gera texto, nunca calcula regras, nunca
 * conversa diretamente com a IA. Nesta fase ele também não altera o
 * comportamento visível da conversa: o roteiro fixo (`sofia-script.ts`)
 * continua sendo o único responsável por decidir o que é perguntado.
 *
 * Ciclo de cada turno (`processTurn`):
 *   evento recebido → WorkingMemory atualizada → Context atualizado →
 *   ConversationState atualizado → Objetivos reavaliados → Planner gera
 *   Plano → ActionEngine gera Ação → Ação devolvida para quem chamou
 *   (a interface ignora o valor de retorno nesta fase).
 *
 * Cada instância representa UMA conversa (sem persistência entre sessões —
 * ver `WorkingMemory.ts` e `MemoryTypes.ts`).
 */
import { decideAction } from "./ActionEngine"
import { buildConversationState } from "./ConversationState"
import { buildContext } from "./Context"
import { evaluateObjectives } from "./Objectives"
import { createPlan, formatPlan } from "./Planner"
import { WorkingMemory } from "./WorkingMemory"
import type {
  Action,
  ConversationEvent,
  ConversationStateSnapshot,
  Plan,
  SofiaContext,
  TurnInput,
} from "./types"

const isDev = typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV)

function log(...args: unknown[]): void {
  if (isDev) console.log("[Sofia][Orchestrator]", ...args)
}

export class SofiaOrchestrator {
  private readonly workingMemory = new WorkingMemory()
  private readonly sessionId: string
  private state: ConversationStateSnapshot
  private context: SofiaContext
  private plan: Plan
  private lastAction: Action

  constructor(sessionId: string) {
    this.sessionId = sessionId
    this.context = buildContext({})
    this.state = buildConversationState({
      sessionId,
      fase: "intro",
      ultimaMensagem: null,
      ultimaPergunta: null,
      status: "em_andamento",
    })
    const evaluation = evaluateObjectives(this.context)
    this.plan = createPlan(evaluation)
    this.lastAction = decideAction(this.plan, this.state, this.context)
  }

  /**
   * Processa um turno completo do ciclo do agente. Nunca lança — uma falha
   * aqui nunca deve afetar a conversa real.
   */
  processTurn(event: ConversationEvent, input: TurnInput): Action {
    try {
      this.workingMemory.record(event)
      log("WorkingMemory atualizada:", event)

      this.context = buildContext(input.answers, this.context)
      log("Contexto atualizado:", this.context)

      const ultimaPergunta = event.type === "bot_message" ? event.texto : this.state.ultimaPergunta
      const ultimaMensagem =
        event.type === "bot_message"
          ? event.texto
          : event.type === "user_answer"
            ? String(event.valor)
            : this.state.ultimaMensagem
      const status = event.type === "conversation_ended" ? event.status : "em_andamento"

      this.state = buildConversationState({
        sessionId: this.sessionId,
        fase: input.fase,
        ultimaMensagem,
        ultimaPergunta,
        status,
      })
      log("Estado atualizado:", this.state)

      const previousConcluidos = this.plan.objetivosConcluidos.map((o) => o.id)
      const evaluation = evaluateObjectives(this.context)
      const novosConcluidos = evaluation.concluidos.filter((o) => !previousConcluidos.includes(o.id))
      for (const objetivo of novosConcluidos) {
        log(`Objetivo concluído: ${objetivo.label}`)
      }
      log("Objetivos atualizados:", evaluation)

      this.plan = createPlan(evaluation)
      log("Plano criado:\n" + formatPlan(this.plan))

      this.lastAction = decideAction(this.plan, this.state, this.context)
      log("Ação gerada:", this.lastAction)

      return this.lastAction
    } catch (err) {
      console.error("[Sofia][Orchestrator] falha ao processar o turno (ignorada, sem impacto na conversa)", err)
      return { type: "OBSERVAR", reason: "Falha ao processar o turno (ignorada)." }
    }
  }

  getState(): ConversationStateSnapshot {
    return this.state
  }

  getContext(): SofiaContext {
    return this.context
  }

  getPlan(): Plan {
    return this.plan
  }

  getLastAction(): Action {
    return this.lastAction
  }

  getWorkingMemory(): WorkingMemory {
    return this.workingMemory
  }
}
