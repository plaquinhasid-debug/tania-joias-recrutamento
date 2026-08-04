/**
 * FEATURE-005, Parte 1 — classificação segura do que a candidata digitou,
 * ANTES de tratar o texto como resposta do campo atual.
 *
 * Módulo novo e isolado (não altera `IntentClassifier.ts`, `sofia-script.ts`
 * nem `useSofiaFlow.ts`): o projeto já tem um classificador de intenção
 * parecido em `orchestrator/IntentClassifier.ts` (shadow, usado só pelo
 * `SofiaOrchestrator`), mas com regras diferentes das pedidas aqui (limite de
 * 6 palavras, sem `AMBIGUOUS`, ordem de checagem diferente). Em vez de mudar
 * aquele arquivo — que já é exercitado pelos cenários do Simulator e por
 * `useSofiaFlow.ts` via `processTurn()` — este módulo fica separado por
 * enquanto. Reconciliar os dois (ou substituir um pelo outro) fica pra uma
 * fase futura, quando este classificador for de fato conectado à conversa.
 *
 * 100% determinístico: nenhuma chamada de IA, nenhum I/O. Puramente baseado
 * em palavras-chave, como pedido. NÃO é chamado por nenhum componente da
 * Landing ainda — ver `classifyCandidateMessage.examples.ts` para os testes.
 */

export type CandidateMessageKind =
  | "ANSWER"
  | "QUESTION"
  | "DOUBT"
  | "OBJECTION"
  | "SMALL_TALK"
  | "END_CONVERSATION"
  | "AMBIGUOUS"

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

function startsWithAny(texto: string, marcadores: string[]): boolean {
  return marcadores.some((m) => texto.startsWith(normalize(m)))
}

function containsWholeWordAny(texto: string, marcadores: string[]): boolean {
  return marcadores.some((m) => new RegExp(`(^|\\W)${normalize(m)}(\\W|$)`).test(texto))
}

// Frases fortes de "quero encerrar" — deliberadamente SEM as palavras de
// educação isoladas ("obrigada"/"valeu"), porque "entendi, obrigada" deve
// virar SMALL_TALK (pedido explícito do FEATURE-005 Parte 1), não encerrar a
// conversa. Só entra aqui o que sinaliza intenção clara de parar.
const END_CONVERSATION_MARKERS = [
  "tchau",
  "ate mais",
  "nao quero continuar",
  "quero parar",
  "desisti",
  "nao quero mais",
  "obrigada, mas nao quero",
  "obrigado, mas nao quero",
]

// Checado ANTES de QUESTION de propósito: frases como "como assim?" ou "pode
// explicar?" contêm "?" (ou começam com uma QUESTION_STARTER, no caso de
// "como assim"), mas o pedido explícito é que sejam DOUBT, não QUESTION.
const DOUBT_MARKERS = [
  "nao entendi",
  "nao entendo",
  "duvida",
  "confus",
  "como assim",
  "pode repetir",
  "nao ficou claro",
  "pode explicar",
  "o que voce quer dizer",
]

// Checado antes de QUESTION pelo mesmo motivo (nenhum destes contém "?" nem
// começa com QUESTION_STARTERS nos exemplos dados, mas mantém a mesma
// prioridade de "sinal emocional/contextual vence sinal genérico de pergunta").
const OBJECTION_MARKERS = [
  "medo",
  "receio",
  "insegura",
  "insegur",
  "nao sei se consigo",
  "sera que",
  "complicado",
  "dificil",
  "nunca vendi",
  "nao tenho muitos contatos",
  "acho que nao vou conseguir",
  "tenho pouco tempo",
]

// Sem limite de palavras (pedido explícito: remover o teto de 6 palavras que
// existia no `IntentClassifier.ts`). Checa a palavra em QUALQUER posição da
// frase, não só no início — necessário pro caso de teste "Eu gostaria de
// saber como funciona o pagamento das peças que eu não vender", que não
// COMEÇA com nenhuma palavra interrogativa mas contém "como". Ver relatório
// final — isso diverge da redação literal ("começar com") do pedido original
// porque a redação literal não cobre o próprio exemplo dado; ficou marcado
// como risco/decisão de julgamento a confirmar.
const QUESTION_STARTERS = ["quanto", "como", "quando", "onde", "por que", "porque", "qual", "quais", "o que", "quem"]

const SMALL_TALK_MARKERS = [
  "tudo bem",
  "como vai",
  "kkk",
  "kk",
  "rsrs",
  "haha",
  "estou bem",
  "que legal",
  "entendi",
  "obrigado",
  "obrigada",
  "valeu",
  "falou",
]

export function classifyCandidateMessage(textoOriginal: string): CandidateMessageKind {
  const texto = normalize(textoOriginal)

  if (!texto) {
    return "AMBIGUOUS"
  }
  if (containsAny(texto, END_CONVERSATION_MARKERS)) {
    return "END_CONVERSATION"
  }
  if (containsAny(texto, DOUBT_MARKERS)) {
    return "DOUBT"
  }
  if (containsAny(texto, OBJECTION_MARKERS)) {
    return "OBJECTION"
  }
  // Checado ANTES de QUESTION: "estou bem, e você?" contém "?" mas é uma
  // pergunta de cortesia recíproca, não uma pergunta de negócio de verdade.
  if (containsAny(texto, SMALL_TALK_MARKERS)) {
    return "SMALL_TALK"
  }
  if (texto.includes("?") || startsWithAny(texto, QUESTION_STARTERS) || containsWholeWordAny(texto, QUESTION_STARTERS)) {
    return "QUESTION"
  }

  return "ANSWER"
}

/**
 * Regra de proteção dos campos (pedido explícito do FEATURE-005 Parte 1):
 * só uma mensagem classificada como ANSWER pode validar/preencher o campo
 * atual, gravar em `answers`, chamar `insertAnswer` ou avançar `stepIndex`.
 * Função pura e testável — ainda NÃO chamada por `useSofiaFlow.ts` (isso
 * fica pra uma fase futura, fora do escopo desta Parte 1).
 */
export function shouldFillCurrentField(kind: CandidateMessageKind): boolean {
  return kind === "ANSWER"
}
