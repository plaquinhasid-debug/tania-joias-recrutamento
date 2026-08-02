/**
 * AgentFactory (RFC-009 / RFC-010).
 *
 * Ponto único para "me dê o perfil do agente X" — quem consome nunca fala
 * diretamente com o `AgentRegistry`. Nesta fase só devolve a Sofia; no
 * futuro, devolver `RecruitAgent`/`SalesAgent`/`SupportAgent` é só uma
 * questão de o `AgentRegistry` ter esses perfis registrados — a Factory em
 * si não muda.
 *
 * RFC-010 esclarece a divisão de responsabilidade entre as três camadas do
 * Agent Profile (sem renomear/remover nada existente):
 *   - `AgentRegistry` LOCALIZA perfis (armazena, busca por id).
 *   - `AgentFactory` (aqui) ENTREGA um perfil pronto pra uso.
 *   - `createSofiaRuntime.ts` (composition root) MONTA a instância
 *     executável completa (perfil + Orchestrator + `AgentRuntime`) — é
 *     esse módulo, não este arquivo, que decide COMO um agente vira algo
 *     rodando. Avaliei criar uma classe `AgentRuntimeFactory` separada
 *     (sugerida na RFC), mas com um único agente e uma única implementação
 *     de Orchestrator hoje, o composition root já cobre esse papel sem
 *     precisar de mais uma camada — ver relatório da RFC-010.
 */
import { createLogger } from "../devLog"
import type { AgentRegistry } from "./AgentRegistry"
import { createDefaultAgentRegistry } from "./AgentRegistry"
import type { AgentProfile } from "./types"

const log = createLogger("[AgentFactory]")

export class AgentFactory {
  private readonly registry: AgentRegistry

  constructor(registry: AgentRegistry) {
    this.registry = registry
  }

  /** Devolve o `AgentProfile` registrado sob este `id`, ou `undefined` se nenhum agente com esse id existir. */
  create(id: string): Readonly<AgentProfile> | undefined {
    const profile = this.registry.get(id)
    if (profile) {
      log("Instância criada:", profile.name)
    } else {
      log(`Nenhum agente registrado com id "${id}".`)
    }
    return profile
  }

  /** Atalho para o único agente desta fase. */
  createSofia(): Readonly<AgentProfile> {
    const profile = this.create("sofia")
    if (!profile) {
      throw new Error("[AgentFactory] Perfil da Sofia não encontrado no AgentRegistry — isso não deveria acontecer.")
    }
    return profile
  }
}

/** Fábrica com a configuração padrão desta fase: registro contendo só a Sofia. */
export function createDefaultAgentFactory(): AgentFactory {
  return new AgentFactory(createDefaultAgentRegistry())
}
