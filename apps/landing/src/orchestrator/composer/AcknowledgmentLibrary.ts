/**
 * AcknowledgmentLibrary (FEATURE-002).
 *
 * Produz uma frase curta que reconhece a mensagem da candidata — nunca
 * responde sobre o conteúdo, nunca usa IA. Existe pra cobrir a lacuna
 * identificada na FEATURE-001: o exemplo oficial do Composer previa um
 * reconhecimento inicial ("Essa é uma ótima pergunta.") que nenhum módulo
 * produzia.
 */
import type { AcknowledgmentKind } from "./types"

const ACKNOWLEDGMENTS_BY_KIND: Record<AcknowledgmentKind, readonly string[]> = {
  QUESTION: [
    "Essa é uma ótima pergunta.",
    "Obrigada por perguntar.",
    "Essa é uma dúvida muito comum.",
    "Fico feliz que você tenha perguntado.",
  ],
  DOUBT: ["Entendi a sua dúvida.", "Claro, vou explicar melhor.", "Obrigada por me contar que isso não ficou claro."],
  OBJECTION: [
    "Entendo como você se sente.",
    "Essa preocupação é completamente compreensível.",
    "Obrigada por compartilhar isso comigo.",
  ],
  ANSWER: ["Entendi.", "Obrigada por compartilhar.", "Perfeito, compreendi."],
  SMALL_TALK: ["Que bom conversar com você.", "Fico feliz em saber disso."],
  GENERIC: ["Entendi.", "Obrigada por me contar."],
}

/** Achatado, usado só por `startsWithAcknowledgment` — não é a lista de escolha (essa é por `kind`). */
const ALL_ACKNOWLEDGMENTS: readonly string[] = Object.values(ACKNOWLEDGMENTS_BY_KIND).flat()

function normalize(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.!?]+$/, "")
    .trim()
}

/** Primeira "frase" do texto — até o primeiro `.`, `!`, `?` ou quebra de linha (inclusive). */
function firstSentence(texto: string): string {
  const match = texto.trim().match(/^[^.!?\n]+[.!?]?/)
  return match ? match[0] : texto.trim()
}

export interface PickAcknowledgmentOptions {
  kind: AcknowledgmentKind
  /** Último acknowledgment usado nesta conversa, se rastreado — evitado na escolha (mesma regra da `TransitionLibrary`: nunca repetir sempre a mesma). */
  avoid?: string
  /** Fonte de aleatoriedade injetável — `Math.random` em produção, determinística em testes. */
  random?: () => number
}

/**
 * Escolhe um acknowledgment da categoria pedida, evitando repetir `avoid`
 * quando possível. Nunca lança, nunca devolve string vazia — se `avoid` for
 * a única opção da categoria, ela é reaproveitada.
 */
export function pickAcknowledgment(options: PickAcknowledgmentOptions): string {
  const { kind, avoid, random = Math.random } = options
  const todas = ACKNOWLEDGMENTS_BY_KIND[kind]
  const candidatas = avoid ? todas.filter((f) => f !== avoid) : todas
  const pool = candidatas.length > 0 ? candidatas : todas
  const index = Math.floor(random() * pool.length)
  return pool[Math.min(index, pool.length - 1)]
}

/**
 * Detecção determinística (sem IA) de que um texto já COMEÇA com um
 * reconhecimento equivalente a algum da biblioteca — usado pelo Composer
 * pra nunca duplicar ("Essa é uma ótima pergunta. \n\n Essa é uma ótima
 * pergunta.", FEATURE-002 Objetivo 5).
 *
 * Limitação documentada: só pega correspondência EXATA (ignorando
 * acento/caixa/pontuação final) com uma frase já catalogada aqui — não
 * detecta paráfrases equivalentes (ex.: "Ótima pergunta essa!"). É a opção
 * "verificação determinística simples" pedida pela RFC; uma detecção mais
 * flexível (ex.: similaridade de texto) ficaria pra uma feature futura.
 */
export function startsWithAcknowledgment(texto: string): boolean {
  const primeira = normalize(firstSentence(texto))
  if (!primeira) return false
  return ALL_ACKNOWLEDGMENTS.some((frase) => normalize(frase) === primeira)
}
