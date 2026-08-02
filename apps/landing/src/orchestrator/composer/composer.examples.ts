/**
 * Exemplos/testes do ResponseComposer (FEATURE-001, seção "TESTES").
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
    name: "Exemplo oficial da FEATURE-001 (resposta dentro das políticas)",
    input: {
      aiResponse: "Os ganhos dependem das vendas realizadas.",
      currentQuestion: "Você trabalha atualmente?",
    },
  },
  {
    name: "Resposta curta",
    input: {
      aiResponse: "Sim! Trabalhamos com consignação — você só paga pelo que vender.",
      currentQuestion: "Você já vendeu algo antes?",
    },
  },
  {
    name: "Resposta longa (excede o limite de palavras)",
    input: {
      aiResponse: Array(40)
        .fill("Essa é uma explicação bem detalhada sobre como funciona todo o processo de revenda.")
        .join(" "),
      currentQuestion: "Faz sentido pra você?",
    },
  },
  {
    name: "Resposta sem pergunta final (Composer deve adicionar a pergunta do roteiro)",
    input: {
      aiResponse: "Entendo sua dúvida sobre os prazos. A gente repassa o valor toda semana.",
      currentQuestion: "Você tem WhatsApp para receber as novidades?",
    },
  },
  {
    name: "Resposta com duas perguntas",
    input: {
      aiResponse: "Você já vendeu algo antes? E tem interesse em produtos de beleza também?",
      currentQuestion: "Me conta um pouco mais sobre você.",
    },
  },
  {
    name: "Resposta contendo promessa proibida",
    input: {
      aiResponse: "Com a Tania Joias você tem ganhos garantidos todo mês, sem risco nenhum!",
      currentQuestion: "Você trabalha atualmente?",
    },
  },
]

/** Roda todos os exemplos e devolve o resultado de cada um — usado tanto para inspeção manual quanto por quem quiser montar um teste formal no futuro. */
export function runComposerExamples(): Array<{ name: string; input: ComposeResponseInput; result: ReturnType<typeof composeResponse> }> {
  return EXAMPLES.map((example) => ({
    name: example.name,
    input: example.input,
    result: composeResponse(example.input),
  }))
}
