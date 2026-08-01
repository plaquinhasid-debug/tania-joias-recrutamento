/**
 * SofiaOrchestrator (RFC-002, fase 1).
 *
 * O "cérebro" da Sofia em construção. NÃO conversa com a candidata e NÃO
 * decide nada nesta fase — só observa cada evento reportado pela interface
 * (`useSofiaFlow`), mantém memória/estado/diagnóstico atualizados, e sempre
 * devolve uma ação estruturada informativa (`type: "observe"`). O roteiro
 * fixo (`sofia-script.ts`) continua sendo o único responsável por decidir o
 * que é perguntado — este módulo só acompanha por fora.
 *
 * Cada instância representa UMA conversa (sem persistência entre sessões —
 * ver `Memory.ts`).
 */
import { buildConversationState } from "./ConversationState"
import { Memory } from "./Memory"
import { diagnose, formatDiagnosis } from "./Planner"
import type {
  ConversationEvent,
  ConversationStateSnapshot,
  ObserveContext,
  OrchestratorAction,
  PlannerDiagnosis,
} from "./types"

const isDev = typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV)

function log(...args: unknown[]): void {
  if (isDev) console.log("[Sofia][Orchestrator]", ...args)
}

export class SofiaOrchestrator {
  private readonly memory = new Memory()
  private readonly sessionId: string
  private state: ConversationStateSnapshot
  private diagnosis: PlannerDiagnosis

  constructor(sessionId: string) {
    this.sessionId = sessionId
    this.state = buildConversationState({
      sessionId,
      fase: "intro",
      ultimaMensagem: null,
      ultimaPergunta: null,
      answers: {},
      status: "em_andamento",
    })
    this.diagnosis = diagnose(this.state)
  }

  /**
   * Recebe um evento da conversa e atualiza memória/estado/diagnóstico.
   * Nunca lança — uma falha aqui nunca deve afetar a conversa real.
   */
  observe(event: ConversationEvent, context: ObserveContext): OrchestratorAction {
    try {
      this.memory.record(event)
      log("Mensagem recebida:", event)

      const ultimaPergunta = event.type === "bot_message" ? event.texto : this.state.ultimaPergunta
      const ultimaMensagem =
        event.type === "bot_message"
          ? event.texto
          : event.type === "user_answer"
            ? String(event.valor)
            : this.state.ultimaMensagem
      const status = event.type === "conversation_ended" ? event.status : "em_andamento"

      const previousConcluidos = this.diagnosis.objetivosConcluidos.map((o) => o.id)

      this.state = buildConversationState({
        sessionId: this.sessionId,
        fase: context.fase,
        ultimaMensagem,
        ultimaPergunta,
        answers: context.answers,
        status,
      })
      log("Estado atualizado:", this.state)

      this.diagnosis = diagnose(this.state)
      const novosConcluidos = this.diagnosis.objetivosConcluidos.filter(
        (o) => !previousConcluidos.includes(o.id),
      )
      for (const objetivo of novosConcluidos) {
        log(`Objetivo concluído: ${objetivo.label}`)
      }
      log("Planner atualizado:\n" + formatDiagnosis(this.diagnosis))

      return {
        type: "observe",
        descricao: "Evento registrado — nenhuma ação tomada nesta fase.",
        payload: { state: this.state, diagnosis: this.diagnosis },
      }
    } catch (err) {
      console.error("[Sofia][Orchestrator] falha ao observar evento (ignorada, sem impacto na conversa)", err)
      return { type: "observe", descricao: "Falha ao observar o evento (ignorada)." }
    }
  }

  getState(): ConversationStateSnapshot {
    return this.state
  }

  getDiagnosis(): PlannerDiagnosis {
    return this.diagnosis
  }

  getMemory(): Memory {
    return this.memory
  }
}
