/**
 * FEATURE-005, Parte 2 — classificação CONTEXTUAL, que leva em conta o campo
 * atual da entrevista (a Parte 1 só olhava o texto, o que causava falsos
 * positivos como "Tenho pouco tempo" virando OBJECTION mesmo quando é a
 * resposta certa pro campo `tempo_disponivel`).
 *
 * Módulo novo, separado de `classifyCandidateMessage.ts` (Parte 1) — aquela
 * função (`classifyCandidateMessage(texto): CandidateMessageKind`) continua
 * EXATAMENTE como está, sem nenhuma mudança, porque os 12 exemplos da Parte
 * 1 dependem dela e ela é a "função de compatibilidade que aceita somente
 * texto" pedida explicitamente. `classifyCandidateMessageContextual()` é a
 * API recomendada pra uso futuro na conversa real.
 *
 * Ainda NÃO conectado a `useSofiaFlow.ts`. Puramente determinístico, sem IA.
 *
 * ## Relação entre os 3 classificadores do projeto (Objetivo 8)
 *
 * 1. `orchestrator/IntentClassifier.ts` — o mais antigo, usado pelo
 *    `SofiaOrchestrator` (shadow), tem seu próprio conjunto de regras
 *    (inclui GREETING/CONFIRMATION/NEGATION que os outros dois não têm, não
 *    tem AMBIGUOUS, não é ciente de campo). Continua em uso pelo pipeline
 *    shadow — não removido.
 * 2. `classifyCandidateMessage.ts` (Parte 1) — classificação só por texto,
 *    sem contexto de campo. Mantido por compatibilidade com os próprios
 *    testes da Parte 1; não recomendado pra uso novo.
 * 3. `classifyCandidateMessageContextual.ts` (este arquivo, Parte 2) — o
 *    classificador recomendado pra quando isto for conectado à conversa
 *    real, porque évita os falsos positivos que os outros dois têm (ex.:
 *    "Nunca vendi" sempre virar OBJECTION, mesmo respondendo
 *    "experiência com vendas").
 *
 * **Risco de divergência**: os 3 têm regras parecidas mas não idênticas
 * (marcadores de palavra-chave duplicados em cada um). Se um dia alguém
 * mudar um marcador só num dos três, os outros dois ficam desatualizados
 * silenciosamente. Recomendação: quando esta Parte 2 for de fato conectada
 * à conversa real (fase de Shadow ou além), vale unificar os 3 num só
 * módulo com um único conjunto de marcadores — não fiz isso agora pra não
 * arriscar nada que já funciona (`IntentClassifier` é usado pelos cenários
 * do Simulator; `classifyCandidateMessage` tem seus próprios testes
 * aprovados).
 */
import type { CandidateMessageKind } from "./classifyCandidateMessage"

export type FieldKind = "TEXT" | "YES_NO" | "PHONE" | "NUMBER" | "CHIPS"
export type ExpectedValueType = "STRING" | "BOOLEAN" | "NUMBER" | "PHONE" | "INSTAGRAM"

export interface CandidateMessageClassificationInput {
  message: string
  currentFieldKey: string
  currentQuestion: string
  fieldKind?: FieldKind
  expectedValueType?: ExpectedValueType
}

export interface CandidateMessageClassification {
  kind: CandidateMessageKind
  confidence: number
  reasonCode: string
  canFillCurrentField: boolean
}

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

// Duplicados de propósito (mesmo raciocínio de isolamento da Parte 1) — ver
// nota "Risco de divergência" no topo do arquivo.
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

const QUESTION_STARTERS = ["quanto", "como", "quando", "onde", "por que", "porque", "qual", "quais", "o que", "quem"]

// IMPLEMENTATION-012E — frases de OBRIGAÇÃO/REGRA na 3ª pessoa impessoal
// ("isso TEM QUE ser assim", "TEM DE pagar", "DEVE SER exatamente") — o jeito
// mais comum de questionar/comentar uma regra do negócio em português
// conversacional sem usar "?" nem nenhuma das palavras interrogativas de
// `QUESTION_STARTERS` (confirmado ao vivo: "o certo tem que ser exatamente
// em 30 dias" virou resposta literal do campo "nome"). Deliberadamente só
// 3ª pessoa/impessoal — variantes na 1ª pessoa ("eu TENHO QUE pagar minhas
// contas", "eu PRECISO ajudar em casa") são falas legítimas e comuns em
// campos como `objetivo`, então ficam de fora de propósito.
const IMPLICIT_RULE_QUESTION_PHRASES = ["tem que", "tem de", "deve ser", "precisa ser"]

// IMPLEMENTATION-012E — verbos conjugados/marcadores de oração que
// praticamente nunca aparecem dentro de um nome próprio ou nome de cidade
// reais (ver `looksLikeFullSentence`, usado só nesses dois campos). "sao"
// (forma normalizada de "são") é DELIBERADAMENTE excluído — colidiria com o
// prefixo de cidade extremamente comum "São" (São Bernardo do Campo, São
// Caetano do Sul, São Paulo...). "moro"/"mora" também ficam de fora — "Moro
// em Mauá" já é uma resposta de cidade válida e testada (Parte 2, exemplo 8).
const CLAUSE_MARKERS = [
  "que", "tem", "tenho", "temos", "tinha", "esta", "estou", "estamos",
  "preciso", "precisa", "precisam", "quero", "quer", "queremos",
  "posso", "pode", "podem", "vou", "vai", "vamos",
  "devo", "deve", "devem", "acho", "acha", "acredito",
]

// FEATURE-005 Parte 7, Objetivo 7: perguntas indiretas educadas ("Gostaria
// de saber se...") não usam nenhuma das palavras interrogativas acima nem
// "?" — sem isso, "Gostaria de saber se preciso comprar o primeiro
// mostruário" passava como resposta válida de qualquer campo aberto.
// Pequena lista de frases fixas, não é NLP de verdade — mesma limitação
// documentada (baseado em palavra-chave) do resto do classificador.
const INDIRECT_QUESTION_PHRASES = [
  "gostaria de saber",
  "queria saber",
  "preciso saber",
  "gostaria de entender",
  "queria entender",
  "preciso entender",
  "gostaria de perguntar",
  "queria perguntar",
]

// Objetivo 5: "como" logo depois de um verbo de autodescrição ("trabalho
// como professora") é comparativo ("as"), não interrogativo ("how"). Sem
// essa exceção, qualquer resposta de profissão que use "como" nesse sentido
// virava QUESTION por engano.
const SELF_DESCRIPTION_VERBS = ["trabalho", "sou", "atuo", "trampo", "faço", "exerço"]

function isComoUsedAsComparison(texto: string): boolean {
  return SELF_DESCRIPTION_VERBS.some((v) => new RegExp(`\\b${normalize(v)}\\s+como\\b`).test(texto))
}

function containsWholeWord(texto: string, palavra: string): boolean {
  return new RegExp(`(^|\\W)${normalize(palavra)}(\\W|$)`).test(texto)
}

/** Versão "ciente de contexto" da detecção de pergunta — usa o mesmo texto
 * normalizado, mas ignora um "como" comparativo (ver `isComoUsedAsComparison`). */
function looksLikeQuestion(texto: string): boolean {
  if (texto.includes("?")) return true
  if (containsAny(texto, INDIRECT_QUESTION_PHRASES)) return true
  if (containsAny(texto, IMPLICIT_RULE_QUESTION_PHRASES)) return true
  for (const starter of QUESTION_STARTERS) {
    if (texto.startsWith(normalize(starter))) return true
    if (starter === "como" && isComoUsedAsComparison(texto)) continue
    if (containsWholeWord(texto, starter)) return true
  }
  return false
}

/**
 * IMPLEMENTATION-012E — `true` se o texto tem estrutura de ORAÇÃO (contém
 * algum verbo conjugado/marcador de oração de `CLAUSE_MARKERS`), usado só
 * pelos campos de "nome próprio" (`nome`/`cidade`) para rejeitar frases que
 * claramente não são um nome de pessoa ou de cidade — mesmo quando não
 * batem em nenhum marcador de dúvida/objeção/pergunta já existente.
 * Corrige o incidente confirmado ao vivo: "o certo tem que ser exatamente
 * em 30 dias" (sem "?", sem nenhuma palavra de `QUESTION_STARTERS`) sendo
 * salvo literalmente como o nome da candidata.
 *
 * Deliberadamente NÃO aplicado a campos de texto livre como `profissao`/
 * `empresa_atual`/`objetivo`, cujas respostas legítimas são frequentemente
 * orações completas ("Trabalho como cabeleireira", "Quero uma renda
 * extra") — aplicar esta checagem ali rejeitaria respostas válidas.
 */
function looksLikeFullSentence(texto: string): boolean {
  return CLAUSE_MARKERS.some((marcador) => containsWholeWord(texto, marcador))
}

/** `true` se o texto bate com QUALQUER categoria de "não é resposta" —
 * usado pelos campos "abertos" (nome, cidade, empresa, objetivo...) pra
 * decidir se um texto livre é compatível com o campo. */
function matchesAnyNonAnswerMarker(texto: string): boolean {
  return (
    containsAny(texto, END_CONVERSATION_MARKERS) ||
    containsAny(texto, DOUBT_MARKERS) ||
    containsAny(texto, SMALL_TALK_MARKERS) ||
    looksLikeQuestion(texto) ||
    containsAny(texto, OBJECTION_MARKERS)
  )
}

/**
 * Regra de compatibilidade por campo (Objetivo 4). Três tipos de campo:
 *  - "campo de nome próprio" (nome, cidade): compatível se não-vazio, não
 *    bater com nenhum marcador genérico de pergunta/dúvida/objeção/
 *    small-talk/despedida, E não tiver estrutura de oração completa
 *    (`looksLikeFullSentence`, IMPLEMENTATION-012E) — um nome ou cidade
 *    reais nunca contêm um verbo conjugado como "tem"/"precisa"/"quero".
 *  - "campo aberto de texto livre" (empresa_atual, objetivo,
 *    estabilidade_profissional): compatível se não-vazio e não bater com
 *    nenhum marcador genérico — SEM a checagem de oração acima, porque
 *    respostas legítimas aqui são frequentemente frases completas
 *    ("Trabalho como cabeleireira", "Quero uma renda extra").
 *  - "campo com vocabulário próprio" (idade, telefone, trabalha,
 *    experiencia_vendas, whatsapp, possui_instagram, tempo_disponivel):
 *    tem uma lista de aceite PRÓPRIA que pode inclusive "vencer" um
 *    marcador genérico — é exatamente isso que resolve "tenho pouco tempo"
 *    (marcador genérico de OBJECTION, mas resposta válida em
 *    `tempo_disponivel`) e "nunca vendi" (idem, válido em
 *    `experiencia_vendas`).
 */
function isFieldCompatible(fieldKey: string, texto: string): boolean {
  switch (fieldKey) {
    case "nome":
    case "cidade":
      return texto.length > 0 && !matchesAnyNonAnswerMarker(texto) && !looksLikeFullSentence(texto)

    case "empresa_atual":
    case "objetivo":
    // QUALIFICACAO-002, Parte 1 — os 3 chips ("Fixa...", "Variável...",
    // "Esporádica...") não batem em nenhum marcador de dúvida/objeção/small
    // talk/pergunta, então a mesma regra de campo aberto já os aceita
    // corretamente. Sem este case, o default (`false`) faria a Parte 7.1
    // rejeitar QUALQUER clique de chip nesta etapa como não-resposta.
    case "estabilidade_profissional":
      return texto.length > 0 && !matchesAnyNonAnswerMarker(texto)

    case "idade":
      return /\d/.test(texto) && !matchesAnyNonAnswerMarker(texto)

    case "telefone": {
      const digitos = (texto.match(/\d/g) ?? []).length
      return digitos >= 8
    }

    case "trabalha":
      return containsAny(texto, ["sim", "nao", "trabalho", "desempregada", "empregada"])

    case "profissao":
      return texto.length > 0 && !matchesAnyNonAnswerMarker(texto)

    case "experiencia_vendas":
      return containsAny(texto, ["sim", "nao", "nunca vendi", "ja vendi", "tenho experiencia", "experiencia com"])

    case "whatsapp":
      return containsAny(texto, ["sim", "nao", "tenho", "nao tenho"])

    case "possui_instagram":
      return containsAny(texto, ["sim", "nao", "tenho instagram", "nao uso instagram", "tenho", "nao tenho"])

    case "instagram":
      return (texto.includes("@") || texto.includes("instagram.com") || (!texto.includes(" ") && texto.length > 1)) && !matchesAnyNonAnswerMarker(texto)

    case "tempo_disponivel":
      return containsAny(texto, [
        "pouco tempo",
        "hora",
        "minuto",
        "manha",
        "tarde",
        "noite",
        "fim de semana",
        "fins de semana",
        "depois do trabalho",
        "integral",
        "dia inteiro",
      ]) || /\d/.test(texto)

    default:
      return false
  }
}

export function classifyCandidateMessageContextual(
  input: CandidateMessageClassificationInput,
): CandidateMessageClassification {
  const texto = normalize(input.message)

  if (!texto) {
    return { kind: "AMBIGUOUS", confidence: 1, reasonCode: "EMPTY_MESSAGE", canFillCurrentField: false }
  }

  if (containsAny(texto, END_CONVERSATION_MARKERS)) {
    return { kind: "END_CONVERSATION", confidence: 0.9, reasonCode: "END_CONVERSATION_MARKER", canFillCurrentField: false }
  }

  if (isFieldCompatible(input.currentFieldKey, texto)) {
    return { kind: "ANSWER", confidence: 0.85, reasonCode: "FIELD_COMPATIBLE", canFillCurrentField: true }
  }

  if (containsAny(texto, DOUBT_MARKERS)) {
    return { kind: "DOUBT", confidence: 0.85, reasonCode: "DOUBT_MARKER", canFillCurrentField: false }
  }

  // Desvio deliberado da ordem literalmente pedida (SMALL_TALK antes de
  // QUESTION, não depois de OBJECTION): "Estou bem, e você?" contém "?" e
  // cairia em QUESTION antes de chegar em SMALL_TALK. Mesmo ajuste já feito
  // na Parte 1, documentado lá e aqui.
  if (containsAny(texto, SMALL_TALK_MARKERS)) {
    return { kind: "SMALL_TALK", confidence: 0.7, reasonCode: "SMALL_TALK_MARKER", canFillCurrentField: false }
  }

  if (looksLikeQuestion(texto)) {
    return { kind: "QUESTION", confidence: 0.8, reasonCode: "QUESTION_MARKER", canFillCurrentField: false }
  }

  if (containsAny(texto, OBJECTION_MARKERS)) {
    return { kind: "OBJECTION", confidence: 0.75, reasonCode: "OBJECTION_MARKER_OUTSIDE_COMPATIBLE_FIELD", canFillCurrentField: false }
  }

  return { kind: "AMBIGUOUS", confidence: 0.4, reasonCode: "NO_RULE_MATCHED", canFillCurrentField: false }
}
