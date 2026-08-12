/**
 * FEATURE-005, Parte 7 — ponte entre `classifyCandidateMessageContextual`
 * (Parte 2) e a FEATURE-004 real em `useSofiaFlow.ts`. Isolado num módulo
 * próprio pra ficar testável sem precisar do hook inteiro.
 *
 * Objetivo 9: a partir desta parte, `classifyCandidateMessageContextual` é
 * a ÚNICA fonte de classificação que decide o comportamento real da
 * FEATURE-004 (substitui `action?.type` do `SofiaOrchestrator`/
 * `IntentClassifier.ts` shadow, que continua rodando só por compatibilidade
 * com o pipeline de observação — ver comentário em `useSofiaFlow.ts`).
 */
import {
  classifyCandidateMessageContextual,
  type CandidateMessageClassification,
  type CandidateMessageClassificationInput,
  type ExpectedValueType,
  type FieldKind,
} from "./classifyCandidateMessageContextual"
import type { CandidateMessageKind } from "./classifyCandidateMessage"
import type { SofiaStep } from "@/data/sofia-script"
import type { SofiaAnswerKey } from "@/types/sofia"

export function resolveFieldKindForStep(step: SofiaStep): FieldKind {
  if (step.kind === "chips") return "CHIPS"
  if (step.kind === "yesno") return "YES_NO"
  return "TEXT"
}

export function resolveExpectedValueTypeForKey(key: SofiaAnswerKey): ExpectedValueType {
  if (key === "telefone") return "PHONE"
  if (key === "instagram") return "INSTAGRAM"
  if (key === "idade") return "NUMBER"
  if (key === "trabalha" || key === "experiencia_vendas" || key === "whatsapp" || key === "possui_instagram") {
    return "BOOLEAN"
  }
  return "STRING"
}

// FEATURE-005 Parte 7.1, Correção 3 — o fallback de erro do classificador
// principal NÃO PODE assumir "sem '?' = ANSWER" (isso foi exatamente o bug
// que causou o incidente da Parte 6: texto sem "?" sendo salvo literalmente
// num campo). Este é um segundo classificador, minúsculo e propositalmente
// mais simples/conservador, com seus PRÓPRIOS marcadores duplicados (mesmo
// raciocínio de isolamento de `classifyCandidateMessageContextual.ts` — se o
// bug estiver em código compartilhado, este fallback não deve herdá-lo). Só
// roda quando o classificador principal já lançou uma exceção, então nunca é
// exercitado em uso normal — e mesmo ele nunca lança (try/catch próprio).
function normalizeFallback(texto: string): string {
  return texto.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
}

function containsAnyFallback(texto: string, marcadores: string[]): boolean {
  return marcadores.some((m) => texto.includes(normalizeFallback(m)))
}

const FALLBACK_END_CONVERSATION_MARKERS = [
  "tchau",
  "ate mais",
  "nao quero continuar",
  "quero parar",
  "desisti",
  "nao quero mais",
]

const FALLBACK_DOUBT_MARKERS = ["nao entendi", "nao entendo", "duvida", "confus", "como assim", "pode repetir", "nao ficou claro"]

const FALLBACK_OBJECTION_MARKERS = ["medo", "receio", "insegura", "nao sei se consigo", "sera que", "complicado", "dificil"]

// FEATURE-005 Parte 7.1 (2ª rodada), Correção 3 — small talk entrou na
// cascata do fallback (não existia na 1ª rodada). Mesma lista reduzida
// (duplicada de propósito) das outras listas deste arquivo.
const FALLBACK_SMALL_TALK_MARKERS = ["tudo bem", "como vai", "kkk", "rsrs", "haha", "estou bem", "obrigada", "obrigado", "valeu"]

const FALLBACK_QUESTION_STARTERS = ["quanto", "como", "quando", "onde", "por que", "porque", "qual", "quais", "o que", "quem"]

// Mesmas frases de pergunta indireta da Parte 7 (`classifyCandidateMessageContextual.ts`,
// `INDIRECT_QUESTION_PHRASES`) — duplicadas aqui de propósito (isolamento),
// mas mantidas EM SINCRONIA deliberadamente: sem isso, "Gostaria de saber"
// não bateria em nenhuma palavra-chave de `FALLBACK_QUESTION_STARTERS` e
// acabaria "compatível" com qualquer campo aberto só por não estar vazio.
const FALLBACK_INDIRECT_QUESTION_PHRASES = ["gostaria de saber", "queria saber", "preciso saber", "gostaria de entender", "queria entender"]

// Mesma exceção da Parte 2 (`isComoUsedAsComparison`): "como" logo depois de
// um verbo de autodescrição ("trabalho como manicure") é comparativo, não
// interrogativo — sem isso, qualquer profissão respondida com "como" cairia
// em AMBIGUOUS neste fallback (ver Correção 4, exemplo "Trabalho como manicure").
const FALLBACK_SELF_DESCRIPTION_VERBS = ["trabalho", "sou", "atuo", "trampo", "faço", "exerço"]

function isComoUsedAsComparisonFallback(texto: string): boolean {
  return FALLBACK_SELF_DESCRIPTION_VERBS.some((v) => new RegExp(`\\b${normalizeFallback(v)}\\s+como\\b`).test(texto))
}

function containsWholeWordFallback(texto: string, palavra: string): boolean {
  return new RegExp(`(^|\\W)${normalizeFallback(palavra)}(\\W|$)`).test(texto)
}

function looksLikeQuestionFallback(texto: string): boolean {
  if (containsAnyFallback(texto, FALLBACK_INDIRECT_QUESTION_PHRASES)) return true
  for (const starter of FALLBACK_QUESTION_STARTERS) {
    if (texto.startsWith(normalizeFallback(starter))) return true
    if (starter === "como" && isComoUsedAsComparisonFallback(texto)) continue
    if (containsWholeWordFallback(texto, starter)) return true
  }
  return false
}

/**
 * FEATURE-005 Parte 7.1 (2ª rodada), Correção 4 — função pura de
 * "compatibilidade forte com o campo atual", nomeada e pedida
 * explicitamente pelo spec. Deliberadamente mais restrita que
 * `isFieldCompatible` do classificador principal (ex.: "tenho pouco
 * tempo"/"nunca vendi" não são reconhecidos aqui) — na dúvida, prefere
 * `false` (e a cascata de `conservativeErrorFallback` cai em AMBIGUOUS) a
 * arriscar um falso positivo de ANSWER.
 *
 * Pra campos abertos (nome/cidade/empresa_atual/profissao/objetivo), texto
 * que PARECE uma pergunta (via `looksLikeQuestionFallback`) nunca é
 * "fortemente compatível" — sem essa guarda, qualquer pergunta sem "?" que
 * também não bata em nenhum marcador forte da Correção 3 (ex.: "Quais
 * cidades vocês atendem") acabaria sendo aceita como resposta só por não
 * estar vazia, o que seria exatamente o tipo de falso positivo que este
 * fallback existe pra evitar.
 */
export function looksCompatibleWithCurrentField(fieldKey: string, texto: string): boolean {
  const normalizado = normalizeFallback(texto)
  switch (fieldKey) {
    case "telefone": {
      const digitos = (normalizado.match(/\d/g) ?? []).length
      return digitos >= 8
    }
    case "idade":
      return /\d/.test(normalizado)
    case "trabalha":
      return containsAnyFallback(normalizado, ["sim", "nao", "trabalho", "desempregada", "empregada"])
    case "experiencia_vendas":
      return containsAnyFallback(normalizado, ["sim", "nao", "nunca vendi", "ja vendi", "tenho experiencia"])
    case "whatsapp":
    case "possui_instagram":
      return containsAnyFallback(normalizado, ["sim", "nao", "tenho", "nao tenho"])
    case "nome":
    case "cidade":
    case "empresa_atual":
    case "profissao":
    case "objetivo":
    // QUALIFICACAO-002, Parte 1 — mesma justificativa do classificador
    // principal (`classifyCandidateMessageContextual.ts`): sem este case, o
    // fallback de erro (raríssimo, só quando o classificador principal
    // lança) rejeitaria os 3 chips desta etapa como AMBIGUOUS.
    case "estabilidade_profissional":
      return normalizado.length > 0 && !looksLikeQuestionFallback(normalizado)
    default:
      return false
  }
}

/**
 * Exportado só para ser testável diretamente (ver Parte 7.1, testes 6-8).
 * FEATURE-005 Parte 7.1 (2ª rodada), Correção 3 — cascata reordenada: os
 * marcadores fortes (encerramento/dúvida/objeção/small talk) são checados
 * ANTES da compatibilidade de campo, não depois (era o contrário na 1ª
 * rodada desta parte). "?" continua sendo o único gatilho de QUESTION nesta
 * cascata de erro — deliberadamente mais simples que o classificador
 * principal (que também reconhece frases indiretas/palavras interrogativas
 * sem "?"); ver nota no relatório desta parte sobre o exemplo "Quais
 * cidades vocês atendem" (Correção 4), que cai em AMBIGUOUS aqui (nunca
 * ANSWER, por causa da guarda em `looksCompatibleWithCurrentField`).
 */
export function conservativeErrorFallback(input: CandidateMessageClassificationInput): CandidateMessageClassification {
  const texto = normalizeFallback(input.message)

  if (input.message.includes("?")) {
    return { kind: "QUESTION", confidence: 0.5, reasonCode: "FALLBACK_ERROR_QUESTION_MARK", canFillCurrentField: false }
  }

  if (containsAnyFallback(texto, FALLBACK_END_CONVERSATION_MARKERS)) {
    return { kind: "END_CONVERSATION", confidence: 0.5, reasonCode: "FALLBACK_ERROR_END_MARKER", canFillCurrentField: false }
  }

  if (containsAnyFallback(texto, FALLBACK_DOUBT_MARKERS)) {
    return { kind: "DOUBT", confidence: 0.4, reasonCode: "FALLBACK_ERROR_DOUBT_MARKER", canFillCurrentField: false }
  }

  if (containsAnyFallback(texto, FALLBACK_OBJECTION_MARKERS)) {
    return { kind: "OBJECTION", confidence: 0.4, reasonCode: "FALLBACK_ERROR_OBJECTION_MARKER", canFillCurrentField: false }
  }

  if (containsAnyFallback(texto, FALLBACK_SMALL_TALK_MARKERS)) {
    return { kind: "SMALL_TALK", confidence: 0.4, reasonCode: "FALLBACK_ERROR_SMALL_TALK_MARKER", canFillCurrentField: false }
  }

  if (looksCompatibleWithCurrentField(input.currentFieldKey, texto)) {
    return { kind: "ANSWER", confidence: 0.4, reasonCode: "FALLBACK_ERROR_CLEAR_FIELD_MATCH", canFillCurrentField: true }
  }

  return { kind: "AMBIGUOUS", confidence: 0.3, reasonCode: "FALLBACK_ERROR_NO_CLEAR_MATCH", canFillCurrentField: false }
}

/**
 * Objetivo 10 (Parte 7) + Correção 3 (Parte 7.1) — se o classificador
 * contextual lançar por qualquer motivo, NUNCA trava a candidata, mas
 * também nunca assume "sem '?' = ANSWER" (esse era o bug real de fallback
 * ingênuo que causou o incidente da Parte 6). Usa `conservativeErrorFallback`
 * — que também tem seu próprio try/catch: se até ele falhar de algum jeito
 * imprevisto, a rede de segurança final é AMBIGUOUS (nunca salva, nunca
 * trava, nunca lança).
 */
export function classifyMessageForFeature004(input: CandidateMessageClassificationInput): CandidateMessageClassification {
  try {
    return classifyCandidateMessageContextual(input)
  } catch (err) {
    console.warn("[sofia] falha no classificador contextual, usando fallback conservador (Parte 7.1, Correção 3)", err)
    try {
      return conservativeErrorFallback(input)
    } catch (fallbackErr) {
      console.warn("[sofia] fallback conservador também falhou, usando AMBIGUOUS fixo", fallbackErr)
      return { kind: "AMBIGUOUS", confidence: 0.1, reasonCode: "FALLBACK_ERROR_DOUBLE_FAILURE", canFillCurrentField: false }
    }
  }
}

/**
 * Objetivo 5 — mensagens estáticas, determinísticas (sem IA) pros tipos que
 * não podem preencher o campo atual e não são uma pergunta de negócio real
 * (essa é tratada à parte, via `handleCandidateQuestion`/FEATURE-004).
 * Deliberadamente curtas e neutras — não é a "condução natural" (Partes
 * 3-5, ainda não implementada/visível), é só uma rede de segurança pra não
 * gravar lixo nos campos.
 */
const DOUBT_EXPLANATIONS: Partial<Record<SofiaAnswerKey, string>> = {
  nome: "É só o seu nome completo, como no documento.",
  cidade: "A cidade onde você mora atualmente.",
  idade: "Sua idade em anos — só o número.",
  telefone: "Seu telefone com DDD, pra gente conseguir te chamar.",
  profissao: "O que você faz hoje pra ganhar a vida (ex.: professora, cabeleireira, autônoma).",
  empresa_atual: "Onde você trabalha hoje — nome da empresa ou do local.",
  estabilidade_profissional: "Se sua rotina de trabalho é sempre a mesma, varia mas é constante, ou é mais esporádica.",
  tempo_disponivel: "Quantas horas por dia você consegue dedicar à revenda.",
  objetivo: "Me conta, em poucas palavras, por que você quer ser revendedora.",
  instagram: "Seu @ do Instagram, se você tiver um.",
}

/**
 * `null` quando o tipo não precisa de uma bolha própria antes de retomar a
 * pergunta. O caso `QUESTION` só é usado por `handleNonAnswerMessage` quando
 * `sofia_perguntas_ia_ativa` está DESLIGADA (Parte 7.1, Correção 2) — com a
 * flag ligada, uma pergunta de negócio real vai para `handleCandidateQuestion`
 * (resposta via IA/FEATURE-004), nunca para esta mensagem estática.
 * `END_CONVERSATION` NÃO é tratado aqui — tem fluxo próprio de encerramento
 * definitivo (`handleAbandonment` em `useSofiaFlow.ts`), nunca retoma a
 * pergunta (Parte 7.1, Correção 1).
 */
export function buildNonAnswerMessage(fieldKey: SofiaAnswerKey, kind: CandidateMessageKind): string | null {
  switch (kind) {
    case "DOUBT":
      return DOUBT_EXPLANATIONS[fieldKey] ?? "Sem problemas, deixa eu reformular."
    case "OBJECTION":
      return "Entendo a sua preocupação.\n\nVamos continuar com calma para eu conhecer melhor o seu perfil."
    case "SMALL_TALK":
      return "Que bom! Vamos continuar então."
    case "QUESTION":
      // Texto exato pedido na Parte 7.1 (2ª rodada), Correção 5.
      return "Essa é uma boa pergunta.\n\nPrefiro não responder algo que possa estar desatualizado neste momento.\n\nVamos continuar."
    case "AMBIGUOUS":
      return "Não peguei bem sua resposta.\n\nVocê poderia responder novamente?"
    default:
      return null
  }
}
