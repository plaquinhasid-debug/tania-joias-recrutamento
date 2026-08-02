/**
 * AgentRegistry (RFC-009).
 *
 * Registro central de todos os `AgentProfile` disponíveis no Lamin Agent
 * Core. Nesta RFC só a Sofia está registrada — o registro existe para o dia
 * em que outros agentes (`RecruitAgent`, `SalesAgent`, `SupportAgent`...)
 * também precisarem de identidade própria, sem que quem consome precise
 * saber onde cada perfil "mora" (só pede pelo `id`).
 */
import { createLogger } from "../devLog"
import { SOFIA_PROFILE } from "./profiles/sofia"
import type { AgentProfile } from "./types"

const log = createLogger("[AgentRegistry]")

export class AgentRegistry {
  private readonly agents = new Map<string, AgentProfile>()

  register(profile: AgentProfile): void {
    this.agents.set(profile.id, profile)
    log("Agente carregado:", profile.name)
    log("Versão:", profile.version)
    log("Role:", profile.role)
  }

  get(id: string): AgentProfile | undefined {
    return this.agents.get(id)
  }

  list(): AgentProfile[] {
    return [...this.agents.values()]
  }
}

/**
 * Fábrica com a configuração padrão desta fase: só a Sofia registrada.
 * Adicionar um agente novo no futuro é só chamar `.register()` com o
 * `AgentProfile` dele aqui — nenhum consumidor do registro precisa mudar.
 */
export function createDefaultAgentRegistry(): AgentRegistry {
  const registry = new AgentRegistry()
  registry.register(SOFIA_PROFILE)
  return registry
}
