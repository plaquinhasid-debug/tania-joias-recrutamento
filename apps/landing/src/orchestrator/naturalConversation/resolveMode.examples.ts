/**
 * FEATURE-005, Parte 5, Objetivo 10 — testes obrigatórios que são
 * alcançáveis SEM deploy/migration aplicada (ver relatório final pra quais
 * dos 20 pedidos dependem de infra publicada e por quê).
 *
 * Cobre: a regra de validação (mesma usada pelo Zod no cliente e espelhada
 * manualmente em `sofia-config/index.ts`, Deno — ver nota de duplicação em
 * `packages/shared/src/schemas.ts`), a resolução OFF/SHADOW/ACTIVE→SHADOW,
 * e o gate de modo do `observeShadowTurn`.
 */
import { naturalConversationModeSchema } from "@tania-joias/shared"

import { resolveNaturalConversationMode } from "./resolveMode"
import { observeShadowTurn } from "./shadowObserver"

export interface ResolveModeExampleResult {
  name: string
  passou: boolean
  detalhe: string
}

export function runResolveModeExamples(): ResolveModeExampleResult[] {
  const resultados: ResolveModeExampleResult[] = []

  function check(name: string, esperado: unknown, obtido: unknown) {
    const passou = JSON.stringify(esperado) === JSON.stringify(obtido)
    resultados.push({ name, passou, detalhe: `esperado=${JSON.stringify(esperado)} obtido=${JSON.stringify(obtido)}` })
  }

  // 1. Setting inexistente (undefined) -> rejeitado pelo schema -> OFF é o fallback de quem chama.
  check("1. Setting inexistente -> schema rejeita (undefined)", false, naturalConversationModeSchema.safeParse(undefined).success)

  // 2. "JSON inválido" (aqui: formato que não é um dos 3 valores aceitos) -> rejeitado.
  check("2. JSON/valor inválido -> schema rejeita (objeto qualquer)", false, naturalConversationModeSchema.safeParse({ modo: "OFF" }).success)

  // 3. Modo desconhecido -> rejeitado.
  check("3. Modo desconhecido ('BOGUS') -> schema rejeita", false, naturalConversationModeSchema.safeParse("BOGUS").success)

  // 4. Setting OFF -> OFF.
  check("4. Setting OFF -> resolve OFF", { effectiveMode: "OFF", sourceTag: "OFF" }, resolveNaturalConversationMode("OFF"))

  // 5. Setting SHADOW -> SHADOW.
  check("5. Setting SHADOW -> resolve SHADOW", { effectiveMode: "SHADOW", sourceTag: "SHADOW" }, resolveNaturalConversationMode("SHADOW"))

  // 6. Setting ACTIVE -> tratado como SHADOW, com sourceTag distinto (ACTIVE_AS_SHADOW).
  check(
    "6. Setting ACTIVE -> resolve SHADOW com sourceTag ACTIVE_AS_SHADOW",
    { effectiveMode: "SHADOW", sourceTag: "ACTIVE_AS_SHADOW" },
    resolveNaturalConversationMode("ACTIVE"),
  )

  // Reforço: valor ausente (nunca deveria acontecer pós-Zod, mas é a segunda rede de segurança) -> DEFAULT_OFF.
  check(
    "6b. Valor ausente -> DEFAULT_OFF (segunda rede de segurança)",
    { effectiveMode: "OFF", sourceTag: "DEFAULT_OFF" },
    resolveNaturalConversationMode(undefined),
  )

  // 9. OFF não executa o Shadow Observer.
  const semObservacao = observeShadowTurn({
    mode: "OFF",
    sessionId: "teste-parte-5",
    fieldKey: "nome",
    currentQuestion: "Qual é o seu nome completo?",
    candidateAnswer: "Camila",
    currentFlowAcceptedAnswer: true,
    knownContext: {},
  })
  check("9. mode=OFF -> observeShadowTurn devolve null", null, semObservacao)

  // 10. SHADOW executa o Shadow Observer (sem alterar nada visível — isso é
  // garantido estruturalmente, já testado na Parte 4; aqui só confirma que
  // o gate de modo injetado libera a execução).
  const comObservacao = observeShadowTurn({
    mode: "SHADOW",
    sessionId: "teste-parte-5",
    fieldKey: "nome",
    currentQuestion: "Qual é o seu nome completo?",
    candidateAnswer: "Camila",
    currentFlowAcceptedAnswer: true,
    knownContext: {},
  })
  check("10. mode=SHADOW -> observeShadowTurn devolve observação real", "ANSWER", comObservacao?.classification.kind)

  return resultados
}
