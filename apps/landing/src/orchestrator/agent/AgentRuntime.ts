/**
 * AgentRuntime (RFC-010).
 *
 * Representa UMA instância executável de um agente: o `AgentProfile` que
 * define quem ele é, o `SofiaOrchestrator` que conduz a conversa, e a
 * sessão a que essa execução pertence. Só reúne essas três coisas — não
 * contém nenhuma regra de negócio da Tania Joias (isso mora no Orchestrator
 * e, principalmente, fora do Agent Core, no motor de regras server-side).
 *
 * Não constrói o Orchestrator sozinho — recebe ele já pronto. Quem decide
 * COMO montar um `AgentRuntime` completo é o composition root
 * (`createSofiaRuntime.ts`), não esta classe.
 */
import { createLogger } from "../devLog"
import type { SofiaOrchestrator } from "../SofiaOrchestrator"
import type { AgentProfile, AgentRuntimeConfig, AgentRuntimeSnapshot } from "./types"

const log = createLogger("[AgentRuntime]")

export class AgentRuntime {
  private readonly profile: Readonly<AgentProfile>
  private readonly sessionId: string
  private readonly orchestrator: SofiaOrchestrator
  private active: boolean

  constructor(config: AgentRuntimeConfig, orchestrator: SofiaOrchestrator) {
    this.profile = config.profile
    this.sessionId = config.sessionId
    this.orchestrator = orchestrator
    this.active = true

    log("Agente inicializado")
    log("Agent ID:", this.profile.id)
    log("Nome:", this.profile.name)
    log("Versão:", this.profile.version)
    log("Session ID:", this.sessionId)
    log("Capabilities carregadas:", this.profile.capabilityIds)
  }

  getOrchestrator(): SofiaOrchestrator {
    return this.orchestrator
  }

  /** Perfil desta execução — somente leitura, já congelado pelo `AgentRegistry` (RFC-010). */
  getProfile(): Readonly<AgentProfile> {
    return this.profile
  }

  getSnapshot(): AgentRuntimeSnapshot {
    return {
      agentId: this.profile.id,
      agentName: this.profile.name,
      agentVersion: this.profile.version,
      sessionId: this.sessionId,
      capabilities: this.profile.capabilities,
      active: this.active,
    }
  }

  /** Marca esta execução como encerrada — não destrói nada, só reflete no snapshot (`active: false`). */
  deactivate(): void {
    this.active = false
  }
}
