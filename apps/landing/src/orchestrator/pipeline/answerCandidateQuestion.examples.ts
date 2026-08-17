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
import { createDefaultKnowledgeEngine } from "../knowledge/KnowledgeEngine"
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

// RFC-INTELLIGENCE-006 — cenários H/I/J: confirmam que o KnowledgeEngine
// encontra `com-002-elegibilidade` (v3, corrigido) pras perguntas de
// idade/Instagram/autônoma, e que o CONTEÚDO do documento não carrega mais
// as três informações incorretas (21 anos, Instagram obrigatório, atividade
// profissional estreita). Não garante o texto exato que a IA vai gerar —
// só a base de conhecimento usada como fonte, que é o que de fato está sob
// controle desta implementação (ver RFC-006, seção 9, observação H/I/J).
export interface KnowledgeCorrectionCheckResult {
  name: string
  passou: boolean
  detalhe: string
}

export async function runComElegibilidadeCorrectionChecks(): Promise<KnowledgeCorrectionCheckResult[]> {
  const engine = createDefaultKnowledgeEngine()
  const resultados: KnowledgeCorrectionCheckResult[] = []

  function check(name: string, condicao: boolean, detalhe: string) {
    resultados.push({ name, passou: condicao, detalhe })
  }

  // H. "preciso ter Instagram?" -> documento encontrado não pode dizer que
  // Instagram é obrigatório.
  {
    const docs = await engine.searchByQuestion("Preciso ter Instagram para ser revendedora?")
    const encontrado = docs.some((d) => d.id === "com-002-elegibilidade")
    const conteudo = docs.find((d) => d.id === "com-002-elegibilidade")?.conteudo ?? ""
    check("H. Pergunta sobre Instagram encontra com-002-elegibilidade", encontrado, `docs encontrados: ${docs.map((d) => d.id).join(", ")}`)
    check(
      "H. Conteúdo não afirma 'WhatsApp e Instagram' como obrigatórios juntos",
      !/whatsapp e instagram/i.test(conteudo),
      `conteudo="${conteudo}"`,
    )
    check("H. Conteúdo afirma Instagram opcional", /instagram.*(não obrigatório|opcional)/i.test(conteudo), `conteudo="${conteudo}"`)
  }

  // I. "qual a idade mínima?" -> documento encontrado deve dizer 18, nunca 21.
  {
    const docs = await engine.searchByQuestion("Qual é a idade mínima para me candidatar?")
    const conteudo = docs.find((d) => d.id === "com-002-elegibilidade")?.conteudo ?? ""
    check("I. Conteúdo não menciona '21 anos'", !/21 anos/i.test(conteudo), `conteudo="${conteudo}"`)
    check("I. Conteúdo menciona '18 anos'", /18 anos/i.test(conteudo), `conteudo="${conteudo}"`)
  }

  // J. "autônoma pode participar?" -> documento deve deixar claro que sim.
  {
    const docs = await engine.searchByQuestion("Eu trabalho por conta própria, autônoma pode se candidatar?")
    const encontrado = docs.some((d) => d.id === "com-002-elegibilidade")
    const conteudo = docs.find((d) => d.id === "com-002-elegibilidade")?.conteudo ?? ""
    check("J. Pergunta sobre autônoma encontra com-002-elegibilidade", encontrado, `docs encontrados: ${docs.map((d) => d.id).join(", ")}`)
    check("J. Conteúdo menciona 'autônoma' explicitamente", /autônoma/i.test(conteudo), `conteudo="${conteudo}"`)
    check(
      "J. Conteúdo não restringe a empresa/escola/hospital/cabeleireira",
      !/empresa, escola ou hospital/i.test(conteudo),
      `conteudo="${conteudo}"`,
    )
  }

  return resultados
}
