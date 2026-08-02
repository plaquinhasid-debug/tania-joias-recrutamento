/**
 * ResponseComposer (FEATURE-001).
 *
 * Monta a mensagem final enviada à candidata a partir de uma resposta de
 * IA já pronta — a primeira peça do Lamin Agent Core com efeito potencial
 * no texto que a candidata veria (ainda não conectada a nada real, ver
 * `INTEGRAÇÃO`/`NÃO IMPLEMENTAR` na FEATURE-001).
 *
 * Nunca chama IA, nunca decide regra de negócio, nunca altera o roteiro,
 * o Planner, o DecisionEngine ou o AI Gateway — só compõe texto.
 *
 * Pipeline (FEATURE-001, Etapa 3):
 *   resposta da IA → aplicar `ResponsePolicies` → adicionar transição
 *   (`TransitionLibrary`) → adicionar a próxima pergunta do roteiro →
 *   mensagem final.
 *
 * Se a resposta da IA violar qualquer política, ela nunca chega à
 * candidata: a mensagem final vira só transição + próxima pergunta — o
 * mesmo espírito de fallback determinístico já usado no resto do projeto
 * (`sofia-reagir`, `agent-ai-gateway`): uma falha da IA nunca pode travar
 * ou distorcer a conversa.
 *
 * NOTA (discrepância observada, não resolvida sem autorização): o exemplo
 * dado na FEATURE-001 mostra a mensagem final começando com um
 * reconhecimento próprio ("Essa é uma ótima pergunta.") que não está na
 * "Entrada IA" nem é a transição — mas o pipeline descrito na Etapa 3 só
 * lista 3 adições (policies → transição → próxima pergunta), sem nenhuma
 * etapa de "reconhecimento". Implementei literalmente o pipeline descrito:
 * o reconhecimento/resposta objetiva já deveria vir DENTRO da própria
 * resposta da IA (o system prompt do `agent-ai-gateway`, derivado do
 * PLAYBOOK-001, já instrui a IA a fazer isso como parte do texto que ela
 * gera) — o Composer não sintetiza reconhecimento algum. Se a intenção era
 * outra, isso precisa de uma FEATURE separada (ex.: um `AcknowledgmentLibrary`).
 */
import { createLogger } from "../devLog"
import { runAllPolicies } from "./ResponsePolicies"
import { pickTransition } from "./TransitionLibrary"
import type { ComposeResponseInput, ComposedResponse } from "./types"

const log = createLogger("[ResponseComposer]")

function juntarPartes(partes: Array<string | undefined>): string {
  return partes
    .filter((p): p is string => Boolean(p && p.trim()))
    .map((p) => p.trim())
    .join("\n\n")
}

export function composeResponse(input: ComposeResponseInput): ComposedResponse {
  const policyResult = runAllPolicies(input.aiResponse)
  log("Policies avaliadas:", policyResult)

  const transitionUsed = pickTransition({ avoid: input.lastTransitionUsed })

  if (!policyResult.passed) {
    log("Resposta da IA violou política(s) — usando fallback determinístico:", policyResult.violations)
    return {
      message: juntarPartes([transitionUsed, input.currentQuestion]),
      usedFallback: true,
      violations: policyResult.violations,
      transitionUsed,
    }
  }

  return {
    message: juntarPartes([input.aiResponse, transitionUsed, input.currentQuestion]),
    usedFallback: false,
    violations: [],
    transitionUsed,
  }
}
