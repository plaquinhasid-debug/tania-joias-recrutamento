/**
 * Testes obrigatórios do FEATURE-005 Parte 1 (10 casos pedidos + 2 extras de
 * reforço). Mesmo padrão de "cenários executáveis" já usado no projeto
 * (sem test runner instalado) — `runClassifyCandidateMessageExamples()`
 * roda tudo e devolve pass/fail de verdade, não uma alegação.
 */
import { classifyCandidateMessage, shouldFillCurrentField, type CandidateMessageKind } from "./classifyCandidateMessage"

export interface ClassifyExample {
  name: string
  texto: string
  esperado: CandidateMessageKind
  /** Só relevante quando esperado !== "ANSWER": confirma que o campo não seria preenchido. */
  esperaProtecaoDoCampo?: boolean
}

export const EXAMPLES: ClassifyExample[] = [
  { name: "1. Pergunta curta com '?'", texto: "Quanto eu ganho de comissão?", esperado: "QUESTION", esperaProtecaoDoCampo: true },
  {
    name: "2. Pergunta longa sem '?'",
    texto: "Eu gostaria de saber como funciona o pagamento das peças que eu não vender",
    esperado: "QUESTION",
    esperaProtecaoDoCampo: true,
  },
  { name: "3. 'Como assim?' (deve ser DOUBT, não QUESTION)", texto: "Como assim?", esperado: "DOUBT", esperaProtecaoDoCampo: true },
  {
    name: "4. 'Tenho medo de não conseguir vender'",
    texto: "Tenho medo de não conseguir vender",
    esperado: "OBJECTION",
    esperaProtecaoDoCampo: true,
  },
  {
    name: "5. 'Estou bem, e você?' (deve ser SMALL_TALK, não QUESTION)",
    texto: "Estou bem, e você?",
    esperado: "SMALL_TALK",
    esperaProtecaoDoCampo: true,
  },
  { name: "6. 'Tchau'", texto: "Tchau", esperado: "END_CONVERSATION", esperaProtecaoDoCampo: true },
  { name: "7. Resposta válida de profissão: 'Sou professora'", texto: "Sou professora", esperado: "ANSWER" },
  { name: "8. Resposta válida de cidade: 'Mauá'", texto: "Mauá", esperado: "ANSWER" },
  {
    name: "9. Confirmar que uma pergunta NÃO preenche o campo atual",
    texto: "Qual é o valor mínimo pra fazer o primeiro pedido?",
    esperado: "QUESTION",
    esperaProtecaoDoCampo: true,
  },
  {
    name: "10. Confirmar que uma objeção NÃO preenche o campo atual",
    texto: "Acho que não vou conseguir",
    esperado: "OBJECTION",
    esperaProtecaoDoCampo: true,
  },
  // Extras — reforçam casos de ambiguidade citados no relatório (conflitos
  // resolvidos por prioridade entre categorias).
  {
    name: "11. 'Entendi, obrigada' (deve ser SMALL_TALK, não END_CONVERSATION)",
    texto: "Entendi, obrigada",
    esperado: "SMALL_TALK",
    esperaProtecaoDoCampo: true,
  },
  {
    name: "12. 'Pode explicar?' (deve ser DOUBT, não QUESTION)",
    texto: "Pode explicar?",
    esperado: "DOUBT",
    esperaProtecaoDoCampo: true,
  },
]

export interface ClassifyExampleResult {
  name: string
  texto: string
  esperado: CandidateMessageKind
  obtido: CandidateMessageKind
  passou: boolean
  protecaoDoCampoOk: boolean
}

export function runClassifyCandidateMessageExamples(): ClassifyExampleResult[] {
  return EXAMPLES.map((example) => {
    const obtido = classifyCandidateMessage(example.texto)
    const passou = obtido === example.esperado
    const protecaoEsperada = example.esperaProtecaoDoCampo ?? false
    const protecaoObtida = !shouldFillCurrentField(obtido)
    const protecaoDoCampoOk = protecaoEsperada ? protecaoObtida : shouldFillCurrentField(obtido)
    return { name: example.name, texto: example.texto, esperado: example.esperado, obtido, passou, protecaoDoCampoOk }
  })
}
