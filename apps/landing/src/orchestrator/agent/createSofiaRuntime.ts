/**
 * createSofiaRuntime (RFC-010) — composition root da Sofia.
 *
 * O ÚNICO lugar do sistema que sabe montar um agente Sofia completo:
 * carrega o perfil pela `AgentFactory`, injeta esse perfil no
 * `SofiaOrchestrator`, e embrulha os dois num `AgentRuntime`. Landing
 * (`useSofiaFlow.ts`) e Agent Simulator usam exclusivamente este módulo —
 * nenhum dos dois importa `SOFIA_PROFILE` nem instancia `SofiaOrchestrator`
 * diretamente (RFC-010, Objetivos 3/4/8).
 *
 * Por que não uma classe `AgentRuntimeFactory` separada (a RFC sugeria
 * como opção): hoje existe um único agente (Sofia) e uma única
 * implementação de Orchestrator. Uma fábrica genérica de runtimes exigiria
 * abstrair `SofiaOrchestrator` atrás de uma interface `Orchestrator`
 * primeiro — isso é uma refatoração maior que a RFC pediu explicitamente
 * para evitar ("Evitar uma refatoração ampla", Objetivo 7). Este módulo
 * cumpre o mesmo papel (é o "runtime factory" da Sofia) como uma função
 * simples; os logs `[AgentRuntimeFactory]` pedidos na RFC saem daqui.
 */
import { SofiaOrchestrator } from "../SofiaOrchestrator"
import { createDefaultAgentFactory } from "./AgentFactory"
import type { AgentFactory } from "./AgentFactory"
import { AgentRuntime } from "./AgentRuntime"
import { createLogger } from "../devLog"

const log = createLogger("[AgentRuntimeFactory]")

const SOFIA_AGENT_ID = "sofia"

/**
 * Monta e devolve um `AgentRuntime` da Sofia pronto para uma sessão.
 * `agentFactory` é injetável só para testes/composição alternativa — o uso
 * normal não precisa passar nada.
 */
export function createSofiaRuntime(sessionId: string, agentFactory: AgentFactory = createDefaultAgentFactory()): AgentRuntime {
  const profile = agentFactory.create(SOFIA_AGENT_ID)
  if (!profile) {
    throw new Error(
      `[AgentRuntimeFactory] Perfil "${SOFIA_AGENT_ID}" não encontrado — composition root não pode montar o Runtime.`,
    )
  }
  log("Perfil carregado:", profile.name)

  const orchestrator = new SofiaOrchestrator({ sessionId, profile })
  log("Orchestrator criado.")

  const runtime = new AgentRuntime({ profile, sessionId }, orchestrator)
  log("Runtime criado.")

  return runtime
}

/**
 * Atalho de compatibilidade para quem só precisa do `SofiaOrchestrator`
 * (não do `AgentRuntime` inteiro) — passa pelo mesmo composition root
 * acima, então `useSofiaFlow.ts` e o Simulator continuam montando a Sofia
 * exatamente da mesma forma (RFC-010, Objetivo 8).
 */
export function createSofiaOrchestrator(sessionId: string): SofiaOrchestrator {
  return createSofiaRuntime(sessionId).getOrchestrator()
}
