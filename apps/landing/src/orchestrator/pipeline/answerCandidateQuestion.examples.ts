/**
 * Exemplos/testes de `answerCandidateQuestion` (FEATURE-003, Objetivo 8).
 *
 * Mesmo padrão já usado em `composer.examples.ts` (RFC-007 em diante): sem
 * test runner instalado neste monorepo, casos de exemplo reais e
 * executáveis, com `runAnswerCandidateQuestionExamples()` mostrando a saída
 * de verdade pra cada um. Uso só em desenvolvimento; não é importado pela
 * Landing.
 *
 * Cobre os 3 casos do Objetivo 8: pergunta coberta pela base de
 * conhecimento, pergunta NÃO coberta (a IA nunca é chamada), e falha
 * simulada da IA (nunca propaga, cai no fallback). O "provider" de IA de
 * cada exemplo é um fake local — nenhuma chamada de rede acontece aqui.
 */
import { AIGateway } from "../ai/AIGateway"
import type { AIProvider, AIRequest, AIResponse } from "../ai/AIProvider"
import { answerCandidateQuestion } from "./answerCandidateQuestion"
import type { AnswerCandidateQuestionResult } from "./answerCandidateQuestion"

function fakeProviderOk(resposta: string): AIProvider {
  return {
    name: "fake-provider-ok",
    async generate(_request: AIRequest): Promise<AIResponse> {
      return { content: resposta, provider: "fake-provider-ok", model: "fake", latencyMs: 1 }
    },
  }
}

function fakeProviderFalha(mensagemErro: string): AIProvider {
  return {
    name: "fake-provider-falha",
    async generate(_request: AIRequest): Promise<AIResponse> {
      throw new Error(mensagemErro)
    },
  }
}

export interface AnswerCandidateQuestionExample {
  name: string
  run: () => Promise<AnswerCandidateQuestionResult>
}

export const EXAMPLES: AnswerCandidateQuestionExample[] = [
  {
    name: "1. Pergunta coberta pela base de conhecimento (IA responde normalmente)",
    run: () =>
      answerCandidateQuestion({
        pergunta: "Quanto eu ganho de comissão?",
        sessionId: "exemplo-feature-003",
        aiGateway: new AIGateway({
          provider: fakeProviderOk(
            "A comissão varia de 30% a 40%, dependendo de quanto você vender em cada ciclo de 30 dias — " +
              "quanto mais vende, maior a porcentagem que fica com você.",
          ),
        }),
      }),
  },
  {
    name: "2. Pergunta FORA da base de conhecimento (a IA nunca é chamada, Objetivo 4)",
    run: () =>
      answerCandidateQuestion({
        pergunta: "Vocês têm alguma promoção de Natal esse ano?",
        sessionId: "exemplo-feature-003",
        // Sem `aiGateway`: se o pipeline tentasse chamar a IA aqui, o
        // `createServerBackedAIGateway` real entraria em ação — o teste só
        // passa "limpo" se nenhum documento for encontrado e a IA for
        // pulada antes disso.
      }),
  },
  {
    name: "3. IA falha (timeout/erro simulado) — nunca propaga, cai no fallback (Objetivo 6)",
    run: () =>
      answerCandidateQuestion({
        pergunta: "As peças têm garantia?",
        sessionId: "exemplo-feature-003",
        aiGateway: new AIGateway({
          provider: fakeProviderFalha("Falha simulada (ex.: timeout da Anthropic)"),
          maxRetries: 0,
        }),
      }),
  },
]

/** Roda todos os exemplos e devolve o resultado de cada um. */
export async function runAnswerCandidateQuestionExamples(): Promise<
  Array<{ name: string; result: AnswerCandidateQuestionResult }>
> {
  const resultados = []
  for (const example of EXAMPLES) {
    resultados.push({ name: example.name, result: await example.run() })
  }
  return resultados
}
