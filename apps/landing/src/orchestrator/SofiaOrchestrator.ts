/**
 * SofiaOrchestrator (RFC-002 / RFC-003 / RFC-005 / RFC-008 / RFC-010).
 *
 * O "cérebro" da Sofia em construção. Ele COORDENA os demais módulos — nunca
 * toma decisão de negócio, nunca gera texto, nunca calcula regras, nunca
 * conversa diretamente com a IA. Nesta fase ele também não altera o
 * comportamento visível da conversa: o roteiro fixo (`sofia-script.ts`)
 * continua sendo o único responsável por decidir o que é perguntado.
 *
 * Ciclo de cada turno (`processTurn`, RFC-005):
 *   evento recebido → WorkingMemory atualizada → Context atualizado →
 *   ConversationState atualizado → Objetivos reavaliados → Planner gera
 *   Plano → IntentClassifier classifica a intenção → DecisionEngine decide
 *   → ActionEngine executa a decisão → Ação devolvida para quem chamou (a
 *   interface ignora o valor de retorno nesta fase — AIGateway e ToolEngine
 *   continuam fora do ciclo, nenhum dos dois é chamado).
 *
 * Cada instância representa UMA conversa (sem persistência entre sessões —
 * ver `WorkingMemory.ts` e `MemoryTypes.ts`).
 *
 * RFC-010: o construtor passou a exigir um `AgentProfile` injetado — este
 * arquivo NUNCA importa `SOFIA_PROFILE` nem qualquer outro perfil concreto,
 * só conhece a interface `AgentProfile`. Quem decide qual perfil usar é o
 * composition root (`agent/createSofiaRuntime.ts`), não este módulo. Isso é
 * o que permite, no futuro, reaproveitar este mesmo Orchestrator para outro
 * agente só trocando o perfil injetado.
 */
import { executeDecision } from "./ActionEngine"
import type { AgentProfile } from "./agent/types"
import { buildConversationState } from "./ConversationState"
import { buildContext } from "./Context"
import { decide } from "./DecisionEngine"
import { createLogger } from "./devLog"
import { classifyIntent } from "./IntentClassifier"
import { evaluateObjectives } from "./Objectives"
import { createPlan, formatPlan } from "./Planner"
import { WorkingMemory } from "./WorkingMemory"
import type {
  Action,
  ConversationEvent,
  ConversationStateSnapshot,
  Decision,
  Intent,
  OrchestratorErrorCode,
  Plan,
  SofiaContext,
  TurnInput,
} from "./types"

const log = createLogger("[Sofia][Orchestrator]")
const logIntent = createLogger("[IntentClassifier]")
const logDecision = createLogger("[DecisionEngine]")

const INTENT_NEUTRO: Intent = { type: "UNKNOWN", confidence: 1, reason: "Nenhum turno processado ainda." }

export interface SofiaOrchestratorConfig {
  sessionId: string
  profile: Readonly<AgentProfile>
}

export class SofiaOrchestrator {
  private readonly workingMemory = new WorkingMemory()
  private readonly sessionId: string
  private readonly profile: Readonly<AgentProfile>
  private state: ConversationStateSnapshot
  private context: SofiaContext
  private plan: Plan
  private intent: Intent
  private decision: Decision
  private lastAction: Action

  constructor(config: SofiaOrchestratorConfig) {
    const { sessionId, profile } = config
    this.sessionId = sessionId
    this.profile = profile
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
    this.intent = INTENT_NEUTRO
    this.decision = decide({
      intent: this.intent,
      plan: this.plan,
      context: this.context,
      state: this.state,
      objectivesEvaluation: evaluation,
    })
    this.lastAction = executeDecision(this.decision, this.plan)
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

      this.intent = classifyIntent(event, this.context, this.state, this.plan)
      logIntent("Mensagem:", ultimaMensagem)
      logIntent("Intenção:", this.intent.type)
      logIntent("Confiança:", this.intent.confidence)

      this.decision = decide({
        intent: this.intent,
        plan: this.plan,
        context: this.context,
        state: this.state,
        objectivesEvaluation: evaluation,
      })
      logDecision("Plano:", this.plan)
      logDecision("Intenção:", this.intent.type)
      logDecision("Decisão:", this.decision.type)
      logDecision("Motivo:", this.decision.reason)

      this.lastAction = executeDecision(this.decision, this.plan)
      log("Ação gerada:", this.lastAction)

      return this.lastAction
    } catch (err) {
      console.error("[Sofia][Orchestrator] falha ao processar o turno (ignorada, sem impacto na conversa)", err)
      const errorCode: OrchestratorErrorCode = "ORCHESTRATOR_PIPELINE_ERROR"
      return {
        type: "WAIT",
        reason: "Falha interna do pipeline.",
        metadata: { error: true, errorCode },
      }
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

  getIntent(): Intent {
    return this.intent
  }

  getDecision(): Decision {
    return this.decision
  }

  getLastAction(): Action {
    return this.lastAction
  }

  getWorkingMemory(): WorkingMemory {
    return this.workingMemory
  }

  /** Perfil injetado no construtor — somente leitura (RFC-010). Nenhum módulo interno pode alterá-lo. */
  getAgentProfile(): Readonly<AgentProfile> {
    return this.profile
  }
}
