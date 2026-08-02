/**
 * Exemplos/testes do ResponseComposer (FEATURE-001, FEATURE-002 e
 * FEATURE-002.1, seções "TESTES"/"EXEMPLOS OBRIGATÓRIOS").
 *
 * Não há test runner (Vitest/Jest) instalado neste monorepo — segue o
 * mesmo padrão já usado no Agent Simulator (RFC-007/008): casos de exemplo
 * reais, executáveis, com `runComposerExamples()`/`runTransitionExamples()`
 * mostrando a saída de verdade para cada um. Uso só em desenvolvimento;
 * não é importado pela Landing.
 */
import { composeResponse } from "./ResponseComposer"
import { findTransitionKind, pickTransition } from "./TransitionLibrary"
import type { ComposeResponseInput } from "./types"

export interface ComposerExample {
  name: string
  input: ComposeResponseInput
}

export const EXAMPLES: ComposerExample[] = [
  {
    name: "1. Pergunta válida",
    input: {
      aiResponse: "Os ganhos dependem das vendas realizadas e não são garantidos.",
      currentQuestion: "Você trabalha atualmente?",
      intent: "QUESTION",
    },
  },
  {
    name: "2. Dúvida válida",
    input: {
      aiResponse: "A gente repassa o valor toda semana, direto na sua conta.",
      currentQuestion: "Você tem WhatsApp para receber as novidades?",
      intent: "DOUBT",
    },
  },
  {
    name: "3. Objeção válida",
    input: {
      aiResponse: "A maioria das nossas revendedoras começou sem nenhuma experiência com vendas.",
      currentQuestion: "Faz sentido pra você continuarmos?",
      intent: "OBJECTION",
    },
  },
  {
    name: "4. Resposta comum",
    input: {
      aiResponse: "Legal saber disso, vai ajudar bastante na sua rotina como revendedora.",
      currentQuestion: "Você tem Instagram?",
      intent: "ANSWER",
    },
  },
  {
    name: "5. IA já inclui reconhecimento (Composer não deve duplicar)",
    input: {
      aiResponse: "Essa é uma ótima pergunta. Os ganhos dependem das vendas realizadas.",
      currentQuestion: "Você trabalha atualmente?",
      intent: "QUESTION",
    },
  },
  {
    name: "6. Resposta longa (excede o limite de palavras do conteúdo)",
    input: {
      aiResponse: Array(40)
        .fill("Essa é uma explicação bem detalhada sobre como funciona todo o processo de revenda.")
        .join(" "),
      currentQuestion: "Faz sentido pra você?",
      intent: "QUESTION",
    },
  },
  {
    name: "7. Resposta com promessa proibida",
    input: {
      aiResponse: "Com a Tania Joias você tem ganhos garantidos todo mês, sem risco nenhum!",
      currentQuestion: "Você trabalha atualmente?",
      intent: "QUESTION",
    },
  },
  {
    name: "8. Resposta com duas perguntas (sem pergunta do roteiro)",
    input: {
      aiResponse: "Você já vendeu algo antes? E tem interesse em produtos de beleza também?",
      intent: "ANSWER",
    },
  },
  {
    name: "9. Resposta vazia",
    input: {
      aiResponse: "   ",
      currentQuestion: "Você trabalha atualmente?",
      intent: "UNKNOWN",
    },
  },
  {
    name: "10. Composição final ultrapassa o limite (conteúdo no teto de 3 parágrafos)",
    input: {
      aiResponse: [
        "O processo de consignação funciona de um jeito bem simples: você recebe o mostruário sem precisar pagar nada antecipado.",
        "Você vende as peças pro seu círculo de contatos, no seu tempo livre, sem nenhuma cobrança de meta ou prazo apertado.",
        "No final do período combinado, você acerta com a gente só o que foi vendido e devolve o restante das peças.",
      ].join("\n\n"),
      currentQuestion: "Isso faz sentido pra sua rotina hoje em dia?",
      intent: "QUESTION",
    },
  },

  // --- FEATURE-002.1 (bug de contagem de perguntas) ---
  {
    name: "F1. Conteúdo da IA contendo uma pergunta + pergunta do roteiro (deve descartar o conteúdo)",
    input: {
      aiResponse: "Você já pensou em revender pra amigas próximas primeiro?",
      currentQuestion: "Você trabalha atualmente?",
      intent: "ANSWER",
    },
  },
  {
    name: "F2. Fallback principal falhando (pergunta do roteiro artificialmente enorme força o fallback mínimo)",
    input: {
      aiResponse: "Com a Tania Joias você tem ganhos garantidos todo mês, sem risco nenhum!",
      currentQuestion: Array(210).fill("palavra").join(" ") + "?",
      intent: "QUESTION",
    },
  },
  {
    name: "F3. Fallback mínimo preservando reconhecimento (mesma composição de F2, checando o acknowledgment)",
    input: {
      aiResponse: "Prometo que você vai ter sucesso garantido revendendo com a gente!",
      currentQuestion: Array(210).fill("informação").join(" ") + "?",
      intent: "DOUBT",
    },
  },
  {
    name: "F4. Mensagem final completa com exatamente uma pergunta",
    input: {
      aiResponse: "O treinamento é feito por vídeo, no seu tempo, sem precisar sair de casa.",
      currentQuestion: "Você consegue dedicar um tempinho por semana?",
      intent: "DOUBT",
    },
  },
  {
    name: "F5. Mensagem sem currentQuestion (transição pode ser interrogativa)",
    input: {
      aiResponse: "Fico feliz que você tenha gostado da proposta.",
      intent: "SMALL_TALK",
    },
  },
]

/** Roda todos os exemplos e devolve o resultado de cada um, incluindo a contagem de "?" na mensagem final (relevante pra FEATURE-002.1). */
export function runComposerExamples(): Array<{
  name: string
  input: ComposeResponseInput
  result: ReturnType<typeof composeResponse>
  questionMarkCount: number
}> {
  return EXAMPLES.map((example) => {
    const result = composeResponse(example.input)
    return {
      name: example.name,
      input: example.input,
      result,
      questionMarkCount: (result.message.match(/\?/g) ?? []).length,
    }
  })
}

/**
 * Exemplos 1-3 da FEATURE-002.1, Objetivo 5 — testam a classificação de
 * transições diretamente (`pickTransition`/`findTransitionKind`), não o
 * pipeline inteiro do Composer, porque `composeResponse` não expõe uma
 * fonte de aleatoriedade injetável na sua API pública (não foi pedido).
 */
export function runTransitionExamples(): Array<{ name: string; transition: string; kind: string | undefined }> {
  const casos = [
    {
      name: "T1. Transição declarativa + pergunta do roteiro (requireDeclarative implícito)",
      pick: () => pickTransition({ requireDeclarative: true }),
    },
    {
      name: "T2. Transição interrogativa sem pergunta do roteiro (RNG forçado pra cair numa interrogativa)",
      pick: () => pickTransition({ requireDeclarative: false, random: () => 0.2 }),
    },
    {
      name: "T3. Mesmo RNG de T2, mas COM pergunta do roteiro — a interrogativa é substituída por uma declarativa",
      pick: () => pickTransition({ requireDeclarative: true, random: () => 0.2 }),
    },
  ]
  return casos.map(({ name, pick }) => {
    const transition = pick()
    return { name, transition, kind: findTransitionKind(transition) }
  })
}
