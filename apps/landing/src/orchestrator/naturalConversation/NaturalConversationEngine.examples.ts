/**
 * FEATURE-005, Parte 3, Objetivo 7 — testes obrigatórios. Mesmo padrão de
 * "cenários executáveis" já usado no projeto (sem test runner instalado).
 */
import { resolveReactionStrategy } from "./ReactionStrategyResolver"
import { buildNaturalReaction } from "./NaturalConversationEngine"
import type { ReactionRequest, ReactionStrategy } from "./types"

function baseRequest(overrides: Partial<ReactionRequest>): ReactionRequest {
  return {
    fieldKey: "nome",
    currentQuestion: "Qual é o seu nome completo?",
    candidateAnswer: "Camila Rodrigues",
    classification: "ANSWER",
    knownContext: {},
    ...overrides,
  }
}

export interface NaturalConversationExampleResult {
  name: string
  passou: boolean
  detalhe: string
}

export function runNaturalConversationEngineExamples(): NaturalConversationExampleResult[] {
  const resultados: NaturalConversationExampleResult[] = []

  function check(name: string, esperado: unknown, obtido: unknown) {
    const passou = JSON.stringify(esperado) === JSON.stringify(obtido)
    resultados.push({ name, passou, detalhe: `esperado=${JSON.stringify(esperado)} obtido=${JSON.stringify(obtido)}` })
  }

  // 1. nome retorna estratégia determinística
  check("1. nome -> DETERMINISTIC", "DETERMINISTIC" satisfies ReactionStrategy, resolveReactionStrategy("nome"))

  // 2. profissão retorna AI
  check("2. profissao -> AI", "AI" satisfies ReactionStrategy, resolveReactionStrategy("profissao"))

  // 3. telefone retorna NONE (conforme configuração em fieldReactionConfig.ts)
  check("3. telefone -> NONE", "NONE" satisfies ReactionStrategy, resolveReactionStrategy("telefone"))

  // 4. campo inexistente retorna NONE
  check("4. campo inexistente -> NONE", "NONE" satisfies ReactionStrategy, resolveReactionStrategy("campo_que_nao_existe"))

  // 5. nenhuma exceção inesperada — chama o Engine com um caso de cada estratégia
  // e com entradas "hostis" (string vazia, campo inexistente, classificação não-ANSWER).
  const casosSemExcecao: ReactionRequest[] = [
    baseRequest({ fieldKey: "nome" }),
    baseRequest({ fieldKey: "profissao", currentQuestion: "Qual é a sua profissão?", candidateAnswer: "Cabeleireira" }),
    baseRequest({ fieldKey: "telefone" }),
    baseRequest({ fieldKey: "trabalha" }),
    baseRequest({ fieldKey: "campo_que_nao_existe" }),
    baseRequest({ fieldKey: "objetivo", classification: "QUESTION" }),
    baseRequest({ fieldKey: "", candidateAnswer: "" }),
  ]
  let nenhumaExcecao = true
  for (const request of casosSemExcecao) {
    try {
      buildNaturalReaction(request)
    } catch {
      nenhumaExcecao = false
    }
  }
  resultados.push({
    name: "5. nenhuma exceção inesperada (7 casos, incluindo entradas hostis)",
    passou: nenhumaExcecao,
    detalhe: nenhumaExcecao ? "nenhuma exceção lançada" : "uma ou mais chamadas lançaram exceção",
  })

  // Extras — confirmam o comportamento fim-a-fim do Engine, não só o resolver.
  const reacaoNome = buildNaturalReaction(baseRequest({ fieldKey: "nome" })).reaction
  check("6. nome -> shouldReact=true, acknowledgment preenchido", true, reacaoNome.shouldReact && Boolean(reacaoNome.acknowledgment))

  const reacaoProfissao = buildNaturalReaction(
    baseRequest({ fieldKey: "profissao", currentQuestion: "Qual é a sua profissão?", candidateAnswer: "Cabeleireira" }),
  ).reaction
  check("7. profissao -> shouldReact=true, strategy=AI, sem chamar IA (acknowledgment vazio)", true, reacaoProfissao.shouldReact && reacaoProfissao.strategy === "AI" && !reacaoProfissao.acknowledgment)

  const reacaoTelefone = buildNaturalReaction(baseRequest({ fieldKey: "telefone" })).reaction
  check("8. telefone -> shouldReact=false (estratégia NONE)", false, reacaoTelefone.shouldReact)

  const reacaoTrabalha = buildNaturalReaction(baseRequest({ fieldKey: "trabalha", candidateAnswer: "true" })).reaction
  check("9. trabalha -> shouldReact=false (regra de negócio hardcoded, nunca reage)", false, reacaoTrabalha.shouldReact)

  const reacaoPerguntaNoLugarDeResposta = buildNaturalReaction(
    baseRequest({ fieldKey: "objetivo", classification: "QUESTION" }),
  ).reaction
  check("10. classification=QUESTION -> shouldReact=false mesmo em campo AI", false, reacaoPerguntaNoLugarDeResposta.shouldReact)

  return resultados
}
