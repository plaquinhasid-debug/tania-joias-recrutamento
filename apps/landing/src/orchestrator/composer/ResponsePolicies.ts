/**
 * ResponsePolicies (FEATURE-001 / FEATURE-002).
 *
 * Checagens determinísticas — SEM IA — que decidem se uma resposta gerada
 * pela IA pode ser usada como está, ou se viola o PLAYBOOK-001
 * (`docs/playbooks/PLAYBOOK-001-sofia.md`) e precisa ser descartada pelo
 * `ResponseComposer`.
 *
 * "Respeita o PLAYBOOK?" (RFC, Etapa 1) não é uma checagem isolada — é o
 * resultado agregado de todas as outras (`runAllPolicies`). Os limites
 * abaixo espelham as regras de tamanho/estrutura/promessas do playbook; se
 * o playbook mudar essas regras, atualize as constantes aqui.
 *
 * FEATURE-002 (Objetivo 6) adiciona `runFinalPolicies`: as checagens acima
 * (`runAllPolicies`) continuam avaliando SÓ o conteúdo bruto da IA — nunca
 * o acknowledgment, a transição ou a próxima pergunta, que são texto
 * curado/determinístico e não precisam ser policiados como se fossem IA.
 * `runFinalPolicies` audita a MENSAGEM COMPOSTA inteira (defesa adicional,
 * não substitui a checagem de conteúdo).
 */
import type { PolicyCheckResult, PolicyViolation } from "./types"

/** Acima do "ideal" do playbook (120 palavras) de propósito — tolera variação natural da IA sem deixar de barrar respostas realmente longas. */
export const MAX_WORDS = 150
export const MAX_PARAGRAPHS = 3
export const MAX_QUESTIONS = 1

/**
 * Limites da MENSAGEM COMPOSTA final (acknowledgment + conteúdo + transição
 * + próxima pergunta), maiores que os limites de conteúdo isolado acima
 * porque a composição legitimamente soma até 4 segmentos. `MAX_FINAL_WORDS`
 * = margem sobre `MAX_WORDS` (150) + acknowledgment/transição/pergunta
 * (tipicamente ~10-20 palavras cada). `MAX_FINAL_PARAGRAPHS` = 4, decisão
 * documentada aqui (FEATURE-002, Objetivo 6): 1 parágrafo por segmento
 * (acknowledgment, conteúdo, transição, pergunta) no caso normal — um
 * conteúdo de 3 parágrafos (o próprio limite de `MAX_PARAGRAPHS`) já
 * estoura esse teto e força o fallback acolhedor, que é o comportamento
 * pretendido.
 */
export const MAX_FINAL_WORDS = 220
export const MAX_FINAL_PARAGRAPHS = 4

/** Espelha `neverPromise` de `supabase/functions/_shared/agent-prompts.ts` — mantenha as duas listas em sincronia se o playbook mudar. */
const FORBIDDEN_PROMISE_PHRASES = [
  "ganho garantido",
  "ganhos garantidos",
  "renda garantida",
  "sucesso garantido",
  "lucro garantido",
  "lucros garantidos",
  "aprovação garantida",
  "aprovada garantidamente",
  "resultado garantido",
  "resultados garantidos",
]

/** Frases "de atendimento automático" que o PLAYBOOK-001 pede para nunca soar — lista inicial, extensível. */
const FORBIDDEN_PHRASES = [
  "prezada candidata",
  "prezado(a)",
  "conforme solicitado",
  "atenciosamente",
  "em caso de dúvidas, entre em contato",
]

function normalize(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

function countParagraphs(texto: string): number {
  return texto
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean).length
}

function countWords(texto: string): number {
  return texto.trim().split(/\s+/).filter(Boolean).length
}

function countQuestions(texto: string): number {
  return (texto.match(/\?/g) ?? []).length
}

export function checkHasText(resposta: string): PolicyViolation | null {
  return resposta.trim().length > 0 ? null : { code: "EMPTY_TEXT", detail: "A resposta está vazia." }
}

export function checkWithinLength(resposta: string, maxWords: number = MAX_WORDS): PolicyViolation | null {
  const palavras = countWords(resposta)
  return palavras <= maxWords
    ? null
    : { code: "EXCEEDS_LENGTH", detail: `A resposta tem ${palavras} palavras (máximo ${maxWords}).` }
}

export function checkMaxParagraphs(resposta: string, maxParagraphs: number = MAX_PARAGRAPHS): PolicyViolation | null {
  const paragrafos = countParagraphs(resposta)
  return paragrafos <= maxParagraphs
    ? null
    : { code: "TOO_MANY_PARAGRAPHS", detail: `A resposta tem ${paragrafos} parágrafos (máximo ${maxParagraphs}).` }
}

export function checkAtMostOneQuestion(resposta: string): PolicyViolation | null {
  const perguntas = countQuestions(resposta)
  return perguntas <= MAX_QUESTIONS
    ? null
    : { code: "MULTIPLE_QUESTIONS", detail: `A resposta contém ${perguntas} perguntas (máximo ${MAX_QUESTIONS}).` }
}

export function checkNoForbiddenPromise(resposta: string): PolicyViolation | null {
  const texto = normalize(resposta)
  const encontrada = FORBIDDEN_PROMISE_PHRASES.find((frase) => texto.includes(normalize(frase)))
  return encontrada ? { code: "FORBIDDEN_PROMISE", detail: `Contém promessa proibida: "${encontrada}".` } : null
}

export function checkNoForbiddenPhrase(resposta: string): PolicyViolation | null {
  const texto = normalize(resposta)
  const encontrada = FORBIDDEN_PHRASES.find((frase) => texto.includes(normalize(frase)))
  return encontrada ? { code: "FORBIDDEN_PHRASE", detail: `Contém frase proibida: "${encontrada}".` } : null
}

const ALL_CHECKS = [
  checkHasText,
  checkWithinLength,
  checkMaxParagraphs,
  checkAtMostOneQuestion,
  checkNoForbiddenPromise,
  checkNoForbiddenPhrase,
]

export function runAllPolicies(resposta: string): PolicyCheckResult {
  const violations = ALL_CHECKS.map((check) => check(resposta)).filter(
    (v): v is PolicyViolation => v !== null,
  )
  return { passed: violations.length === 0, violations }
}

/**
 * Validação final sobre a MENSAGEM COMPOSTA inteira (FEATURE-002, Objetivo
 * 6) — última camada de defesa antes de considerar a composição pronta.
 *
 * `fullMessage` é o texto completo (acknowledgment + conteúdo + transição +
 * pergunta) e é o que se avalia para tamanho/parágrafos/promessas/frases
 * proibidas. `questionCountText` é DELIBERADAMENTE menor — só
 * acknowledgment + conteúdo, sem a transição nem a próxima pergunta —
 * porque a checagem "no máximo 1 pergunta" não deve penalizar transições
 * retóricas já vetadas pela `TransitionLibrary` (ex.: "Posso te fazer mais
 * uma pergunta?") nem a pergunta oficial do roteiro, que é sempre única e
 * controlada por fora do Composer.
 */
export function runFinalPolicies(fullMessage: string, questionCountText: string): PolicyCheckResult {
  const checks: Array<PolicyViolation | null> = [
    checkHasText(fullMessage),
    checkWithinLength(fullMessage, MAX_FINAL_WORDS),
    checkMaxParagraphs(fullMessage, MAX_FINAL_PARAGRAPHS),
    checkAtMostOneQuestion(questionCountText),
    checkNoForbiddenPromise(fullMessage),
    checkNoForbiddenPhrase(fullMessage),
  ]
  const violations = checks.filter((v): v is PolicyViolation => v !== null)
  return { passed: violations.length === 0, violations }
}
