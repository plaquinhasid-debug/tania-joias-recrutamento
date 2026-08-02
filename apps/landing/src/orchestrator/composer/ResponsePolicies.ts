/**
 * ResponsePolicies (FEATURE-001).
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
 */
import type { PolicyCheckResult, PolicyViolation } from "./types"

/** Acima do "ideal" do playbook (120 palavras) de propósito — tolera variação natural da IA sem deixar de barrar respostas realmente longas. */
export const MAX_WORDS = 150
export const MAX_PARAGRAPHS = 3
export const MAX_QUESTIONS = 1

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

export function checkWithinLength(resposta: string): PolicyViolation | null {
  const palavras = countWords(resposta)
  return palavras <= MAX_WORDS
    ? null
    : { code: "EXCEEDS_LENGTH", detail: `A resposta tem ${palavras} palavras (máximo ${MAX_WORDS}).` }
}

export function checkMaxParagraphs(resposta: string): PolicyViolation | null {
  const paragrafos = countParagraphs(resposta)
  return paragrafos <= MAX_PARAGRAPHS
    ? null
    : { code: "TOO_MANY_PARAGRAPHS", detail: `A resposta tem ${paragrafos} parágrafos (máximo ${MAX_PARAGRAPHS}).` }
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
