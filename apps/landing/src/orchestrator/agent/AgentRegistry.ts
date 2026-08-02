/**
 * AgentRegistry (RFC-009 / RFC-010).
 *
 * Registro central de todos os `AgentProfile` disponíveis no Lamin Agent
 * Core. Nesta RFC só a Sofia está registrada — o registro existe para o dia
 * em que outros agentes (`RecruitAgent`, `SalesAgent`, `SupportAgent`...)
 * também precisarem de identidade própria, sem que quem consome precise
 * saber onde cada perfil "mora" (só pede pelo `id`).
 *
 * RFC-010: todo perfil é congelado (`freezeProfile`) no momento do
 * `register()` — é o único ponto do sistema que faz isso, então qualquer
 * perfil que sai daqui (via `get()`/`list()`, ou por extensão via
 * `AgentFactory`) já vem protegido contra mutação acidental.
 */
import { createLogger } from "../devLog"
import { freezeProfile } from "./freezeProfile"
import { SOFIA_PROFILE } from "./profiles/sofia"
import type { AgentProfile } from "./types"

const log = createLogger("[AgentRegistry]")

export class AgentRegistry {
  private readonly agents = new Map<string, Readonly<AgentProfile>>()

  register(profile: AgentProfile): void {
    const frozen = freezeProfile(profile)
    this.agents.set(frozen.id, frozen)
    log("Agente carregado:", frozen.name)
    log("Versão:", frozen.version)
    log("Role:", frozen.role)
  }

  get(id: string): Readonly<AgentProfile> | undefined {
    return this.agents.get(id)
  }

  list(): Readonly<AgentProfile>[] {
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
