/**
 * IntentClassifier (RFC-005).
 *
 * Recebe o evento da conversa (a mensagem), o Contexto, o Estado e o Plano
 * atuais, e devolve uma Intenção estruturada — nunca texto, nunca resposta.
 * Totalmente determinístico nesta fase: regras simples de palavras-chave,
 * sem IA, sem Claude, sem nenhum modelo.
 *
 * Só classifica mensagens de verdade da candidata (eventos `user_answer`
 * com texto livre). Para os demais tipos de evento, ou quando a resposta é
 * estruturada (sim/não, chip), devolve uma intenção neutra — mantém o
 * pipeline uniforme (o Orchestrator sempre chama o classificador, sem
 * precisar saber por dentro qual evento é qual).
 *
 * É uma heurística simples e deliberadamente ingênua (contém/começa com,
 * sem NLP de verdade) — mensagens compostas (ex.: saudação + pergunta na
 * mesma frase) podem ser classificadas de forma imprecisa. Documentado aqui
 * de propósito para uma fase futura decidir se vale a pena refinar.
 */
import type { ConversationEvent, ConversationStateSnapshot, Intent, Plan, SofiaContext } from "./types"

const GREETING_WORDS = ["oi", "ola", "bom dia", "boa tarde", "boa noite", "e ai", "eae", "opa"]
const FAREWELL_WORDS = ["obrigado", "obrigada", "tchau", "ate mais", "valeu", "falou"]
const OBJECTION_MARKERS = [
  "medo",
  "receio",
  "insegura",
  "insegur",
  "nao sei se consigo",
  "sera que",
  "complicado",
  "dificil",
]
const DOUBT_MARKERS = [
  "nao entendi",
  "nao entendo",
  "duvida",
  "confus",
  "como assim",
  "pode repetir",
  "nao ficou claro",
]
const QUESTION_STARTERS = ["quanto", "como", "quando", "onde", "por que", "porque", "qual", "quais", "o que", "quem"]
const CONFIRMATION_WORDS = ["sim", "claro", "com certeza", "isso", "isso mesmo", "exato", "ok", "certo", "beleza"]
const NEGATION_WORDS = ["nao", "nunca", "jamais", "de jeito nenhum"]
const SMALL_TALK_MARKERS = ["tudo bem", "como vai", "kkk", "kk", "rsrs", "haha"]

function normalize(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

function containsAny(texto: string, marcadores: string[]): boolean {
  return marcadores.some((m) => texto.includes(normalize(m)))
}

function classifyText(textoOriginal: string): Intent {
  const texto = normalize(textoOriginal)
  const palavras = texto.split(/\s+/).filter(Boolean)

  if (!texto) {
    return { type: "UNKNOWN", confidence: 0.5, reason: "Mensagem vazia." }
  }
  if (palavras.length <= 3 && containsAny(texto, GREETING_WORDS)) {
    return { type: "GREETING", confidence: 0.8, reason: "Contém saudação e é uma mensagem curta." }
  }
  if (containsAny(texto, FAREWELL_WORDS)) {
    return { type: "END_CONVERSATION", confidence: 0.7, reason: "Contém expressão de despedida/agradecimento final." }
  }
  if (texto.includes("?") || (palavras.length <= 6 && QUESTION_STARTERS.some((q) => texto.startsWith(normalize(q))))) {
    return { type: "QUESTION", confidence: 0.75, reason: "Contém ponto de interrogação ou começa com palavra interrogativa." }
  }
  if (containsAny(texto, OBJECTION_MARKERS)) {
    return { type: "OBJECTION", confidence: 0.65, reason: "Contém marcador de insegurança/objeção." }
  }
  if (containsAny(texto, DOUBT_MARKERS)) {
    return { type: "DOUBT", confidence: 0.7, reason: "Contém marcador de dúvida/confusão." }
  }
  if (palavras.length <= 3 && NEGATION_WORDS.includes(texto)) {
    return { type: "NEGATION", confidence: 0.75, reason: "Mensagem é uma negação curta e isolada." }
  }
  if (palavras.length <= 3 && CONFIRMATION_WORDS.includes(texto)) {
    return { type: "CONFIRMATION", confidence: 0.75, reason: "Mensagem é uma confirmação curta e isolada." }
  }
  if (containsAny(texto, SMALL_TALK_MARKERS)) {
    return { type: "SMALL_TALK", confidence: 0.5, reason: "Contém marcador de conversa informal." }
  }

  return {
    type: "ANSWER",
    confidence: 0.6,
    reason: "Mensagem substancial sem marcador de outra intenção — tratada como resposta ao roteiro.",
  }
}

export function classifyIntent(
  event: ConversationEvent,
  _context: SofiaContext,
  _state: ConversationStateSnapshot,
  _plan: Plan,
): Intent {
  if (event.type !== "user_answer") {
    return { type: "UNKNOWN", confidence: 1, reason: "Evento não é uma mensagem da candidata." }
  }
  if (typeof event.valor !== "string") {
    return { type: "ANSWER", confidence: 1, reason: "Resposta estruturada (sim/não ou opção) — não é texto livre." }
  }
  return classifyText(event.valor)
}
