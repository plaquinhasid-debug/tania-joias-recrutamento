/**
 * Exemplos/testes do ResponseComposer (FEATURE-001 e FEATURE-002, seções
 * "TESTES"/"EXEMPLOS OBRIGATÓRIOS").
 *
 * Não há test runner (Vitest/Jest) instalado neste monorepo — segue o
 * mesmo padrão já usado no Agent Simulator (RFC-007/008): casos de exemplo
 * reais, executáveis, com `runComposerExamples()` mostrando a saída de
 * verdade para cada um. Uso só em desenvolvimento; não é importado pela
 * Landing.
 */
import { composeResponse } from "./ResponseComposer"
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
    name: "8. Resposta com duas perguntas",
    input: {
      aiResponse: "Você já vendeu algo antes? E tem interesse em produtos de beleza também?",
      currentQuestion: "Me conta um pouco mais sobre você.",
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
]

/** Roda todos os exemplos e devolve o resultado de cada um — usado tanto para inspeção manual quanto por quem quiser montar um teste formal no futuro. */
export function runComposerExamples(): Array<{
  name: string
  input: ComposeResponseInput
  result: ReturnType<typeof composeResponse>
}> {
  return EXAMPLES.map((example) => ({
    name: example.name,
    input: example.input,
    result: composeResponse(example.input),
  }))
}
