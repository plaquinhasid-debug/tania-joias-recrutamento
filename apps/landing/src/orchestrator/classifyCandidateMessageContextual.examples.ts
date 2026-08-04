/**
 * FEATURE-005, Parte 2 — os 22 testes obrigatórios (18 de classificação
 * contextual + 4 de integração com o NaturalConversationEngine, testados
 * separadamente em `NaturalConversationEngine.examples.ts`).
 */
import { classifyCandidateMessageContextual, type CandidateMessageClassificationInput } from "./classifyCandidateMessageContextual"
import type { CandidateMessageKind } from "./classifyCandidateMessage"

export interface ContextualExample {
  name: string
  input: CandidateMessageClassificationInput
  esperadoKind: CandidateMessageKind
  esperadoCanFill: boolean
}

function input(message: string, currentFieldKey: string, currentQuestion = ""): CandidateMessageClassificationInput {
  return { message, currentFieldKey, currentQuestion }
}

export const EXAMPLES: ContextualExample[] = [
  { name: "1. 'Tenho pouco tempo' em tempo_disponivel", input: input("Tenho pouco tempo.", "tempo_disponivel"), esperadoKind: "ANSWER", esperadoCanFill: true },
  { name: "2. 'Tenho pouco tempo' em cidade", input: input("Tenho pouco tempo.", "cidade"), esperadoKind: "OBJECTION", esperadoCanFill: false },
  { name: "3. 'Nunca vendi' em experiencia_vendas", input: input("Nunca vendi", "experiencia_vendas"), esperadoKind: "ANSWER", esperadoCanFill: true },
  { name: "4. 'Nunca vendi' em profissao", input: input("Nunca vendi", "profissao"), esperadoKind: "OBJECTION", esperadoCanFill: false },
  { name: "5. 'Trabalho como professora' em profissao", input: input("Trabalho como professora", "profissao"), esperadoKind: "ANSWER", esperadoCanFill: true },
  { name: "6. 'Trabalho como professora' não pode virar QUESTION", input: input("Trabalho como professora", "profissao"), esperadoKind: "ANSWER", esperadoCanFill: true },
  { name: "7. 'Eu gostaria de saber como funciona a comissão'", input: input("Eu gostaria de saber como funciona a comissão", "objetivo"), esperadoKind: "QUESTION", esperadoCanFill: false },
  { name: "8. 'Moro em Mauá' em cidade", input: input("Moro em Mauá", "cidade"), esperadoKind: "ANSWER", esperadoCanFill: true },
  { name: "9. 'Quais cidades vocês atendem?' em cidade", input: input("Quais cidades vocês atendem?", "cidade"), esperadoKind: "QUESTION", esperadoCanFill: false },
  { name: "10. 'Tenho 32 anos' em idade", input: input("Tenho 32 anos", "idade"), esperadoKind: "ANSWER", esperadoCanFill: true },
  { name: "11. 'Qual é a idade mínima?' em idade", input: input("Qual é a idade mínima?", "idade"), esperadoKind: "QUESTION", esperadoCanFill: false },
  { name: "12. 'Sou autônoma' em empresa_atual", input: input("Sou autônoma", "empresa_atual"), esperadoKind: "ANSWER", esperadoCanFill: true },
  { name: "13. 'Como assim?'", input: input("Como assim?", "objetivo"), esperadoKind: "DOUBT", esperadoCanFill: false },
  { name: "14. 'Estou bem, e você?'", input: input("Estou bem, e você?", "objetivo"), esperadoKind: "SMALL_TALK", esperadoCanFill: false },
  { name: "15. 'Tchau'", input: input("Tchau", "objetivo"), esperadoKind: "END_CONVERSATION", esperadoCanFill: false },
  { name: "16. Texto vazio", input: input("", "nome"), esperadoKind: "AMBIGUOUS", esperadoCanFill: false },
  { name: "17. 'Quero renda extra' em objetivo", input: input("Quero renda extra", "objetivo"), esperadoKind: "ANSWER", esperadoCanFill: true },
  { name: "18. 'Quanto posso ganhar como revendedora?' em objetivo", input: input("Quanto posso ganhar como revendedora?", "objetivo"), esperadoKind: "QUESTION", esperadoCanFill: false },
]

export interface ContextualExampleResult {
  name: string
  passou: boolean
  detalhe: string
}

export function runContextualExamples(): ContextualExampleResult[] {
  return EXAMPLES.map((example) => {
    const resultado = classifyCandidateMessageContextual(example.input)
    const passou = resultado.kind === example.esperadoKind && resultado.canFillCurrentField === example.esperadoCanFill
    return {
      name: example.name,
      passou,
      detalhe: `esperado=(${example.esperadoKind}, canFill=${example.esperadoCanFill}) obtido=(${resultado.kind}, canFill=${resultado.canFillCurrentField}, reasonCode=${resultado.reasonCode})`,
    }
  })
}
