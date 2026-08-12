/**
 * Roteiro da Sofia como DADOS, não como IA de verdade — é um wizard
 * determinístico. Cada etapa descreve a pergunta, o tipo de input e a
 * validação (Zod) esperada. `useSofiaFlow` percorre este array e decide
 * a próxima etapa com base nas respostas já dadas (função `skip`).
 */
import { z } from "zod"
import { identificacaoSchema, qualificacaoSchema } from "@tania-joias/shared"

import type { SofiaAnswerKey, SofiaAnswers } from "@/types/sofia"

// Reforça logo de cara que é rápido e sem compromisso — dado real (Admin >
// Abandonos, 12/08/2026): ~78% de quem abandona a conversa sai antes de
// responder a primeira pergunta, sem digitar nada. Objetivo é reduzir essa
// hesitação inicial.
export const SOFIA_INTRO_LINES = [
  "Olá 🌸",
  "Sou a Sofia, assistente virtual da Tania Joias.",
  "Vou te fazer só algumas perguntas rápidas pra ver se você já pode começar a vender com a gente — sem compromisso.",
  "Leva menos de 2 minutos.",
] as const

// Texto oficial e imutável da regra "Você trabalha atualmente?" — nunca deve
// ser gerado ou parafraseado por IA. Definido pelo Antonio (proprietário),
// ver `docs/knowledge/COM-002-recrutamento.md` v1.1 ("Critério de
// reprovação" — desempregada). Verbatim, sem paráfrase — só dividido em 2
// linhas pra caber no formato de bolhas de chat já usado no roteiro.
export const SOFIA_REJECTION_LINES = [
  "No momento, um dos requisitos para ser revendedora é estar trabalhando (empresa, escola, hospital) ou atuar como cabeleireira em salão de beleza.",
  "Por esse motivo, não conseguimos seguir com sua candidatura agora — mas você pode se candidatar novamente assim que essa situação mudar.",
] as const

export const SOFIA_APPROVED_LINES = [
  "Parabéns!",
  "Seu perfil foi aprovado.",
  "Nossa equipe entrará em contato em breve.",
] as const

export const SOFIA_EM_ANALISE_LINES = [
  "Muito obrigada por compartilhar tudo isso com a gente!",
  "Sua candidatura já está em análise pela nossa equipe.",
  "Em breve entraremos em contato com uma novidade.",
] as const

export const SOFIA_REPROVADA_FINAL_LINES = [
  "Muito obrigada por compartilhar tudo isso com a gente!",
  "Hoje seu perfil não seguiu para a próxima etapa.",
  "Vamos guardar seu cadastro para futuras oportunidades na Tania Joias.",
] as const

interface SofiaStepBase {
  key: SofiaAnswerKey
  question: string
  /** Se retornar true, esta etapa é pulada dado o estado atual das respostas. */
  skip?: (answers: SofiaAnswers) => boolean
}

export interface SofiaTextStep extends SofiaStepBase {
  kind: "text" | "textarea"
  placeholder?: string
  schema: z.ZodTypeAny
}

export interface SofiaYesNoStep extends SofiaStepBase {
  kind: "yesno"
  yesLabel: string
  noLabel: string
}

export interface SofiaChipsStep extends SofiaStepBase {
  kind: "chips"
  chips: readonly string[]
  placeholder?: string
  schema: z.ZodTypeAny
}

export type SofiaStep = SofiaTextStep | SofiaYesNoStep | SofiaChipsStep

const instagramHandleSchema = z
  .string()
  .trim()
  .min(1, "Informe seu @ do Instagram.")

const trabalhaFalso = (answers: SofiaAnswers) => answers.trabalha !== true

/** Roteiro completo, na ordem em que deve ser perguntado. */
export const SOFIA_STEPS: SofiaStep[] = [
  {
    key: "nome",
    kind: "text",
    question: "Qual é o seu nome completo?",
    placeholder: "Seu nome completo",
    schema: identificacaoSchema.shape.nome,
  },
  {
    key: "cidade",
    kind: "text",
    question: "Em qual cidade você mora?",
    placeholder: "Sua cidade",
    schema: identificacaoSchema.shape.cidade,
  },
  {
    key: "idade",
    kind: "text",
    question: "Qual é a sua idade?",
    placeholder: "Ex.: 28",
    schema: identificacaoSchema.shape.idade,
  },
  {
    key: "telefone",
    kind: "text",
    question: "Qual é o seu telefone com DDD?",
    placeholder: "(11) 91234-5678",
    schema: identificacaoSchema.shape.telefone,
  },
  {
    key: "trabalha",
    kind: "yesno",
    question: "Você trabalha atualmente?",
    yesLabel: "Sim, trabalho",
    noLabel: "Não trabalho",
  },
  {
    key: "profissao",
    kind: "text",
    question: "Qual é a sua profissão?",
    placeholder: "Sua profissão",
    schema: qualificacaoSchema.shape.profissao,
    skip: trabalhaFalso,
  },
  {
    key: "empresa_atual",
    kind: "text",
    // Pergunta base — quando a IA contextual estiver ativa (`sofia_ia_ativa`),
    // esta linha é substituída por uma variante que já reage à profissão
    // informada no passo anterior (ver `useSofiaFlow.ts`/`sofia-reagir`).
    question: "Onde você trabalha?",
    placeholder: "Nome da empresa",
    schema: qualificacaoSchema.shape.empresa_atual,
    skip: trabalhaFalso,
  },
  {
    // QUALIFICACAO-002, Parte 1 — coleta estruturada de "estabilidade
    // profissional" (regularidade da atividade AUTODECLARADA, não é medida
    // de risco/garantia). Mesmo padrão de `tempo_disponivel`: chips com
    // fallback de texto livre. A normalização do texto do chip pra
    // ALTA/MEDIA/BAIXA acontece só em `finalize-candidate` — este passo
    // NUNCA participa de calcularIpr/decidirStatus/classificarPerfil.
    key: "estabilidade_profissional",
    kind: "chips",
    question: "Sua rotina de trabalho hoje é mais fixa, ou mais variável?",
    chips: ["Fixa — mesma empresa/local, mesma escala", "Variável, mas recorrente", "Esporádica, sem muita regularidade"],
    placeholder: "Ou descreva com suas palavras",
    schema: qualificacaoSchema.shape.estabilidade_profissional,
    skip: trabalhaFalso,
  },
  {
    key: "experiencia_vendas",
    kind: "yesno",
    question: "Você já trabalhou com vendas?",
    yesLabel: "Sim",
    noLabel: "Não",
    skip: trabalhaFalso,
  },
  {
    key: "whatsapp",
    kind: "yesno",
    question: "O telefone informado possui WhatsApp?",
    yesLabel: "Sim",
    noLabel: "Não",
    skip: trabalhaFalso,
  },
  {
    key: "possui_instagram",
    kind: "yesno",
    question: "Você possui Instagram?",
    yesLabel: "Sim",
    noLabel: "Não",
    skip: trabalhaFalso,
  },
  {
    key: "instagram",
    kind: "text",
    question: "Qual é o seu @ do Instagram?",
    placeholder: "@seuusuario",
    schema: instagramHandleSchema,
    skip: (answers) => trabalhaFalso(answers) || answers.possui_instagram !== true,
  },
  {
    key: "tempo_disponivel",
    kind: "chips",
    question: "Quanto tempo você pode dedicar por dia?",
    chips: ["1 hora", "2 horas", "3+ horas"],
    placeholder: "Ou digite outro valor",
    schema: qualificacaoSchema.shape.tempo_disponivel,
    skip: trabalhaFalso,
  },
  {
    key: "objetivo",
    kind: "textarea",
    question: "Por que você deseja trabalhar com a Tania Joias?",
    placeholder: "Conte um pouco sobre o seu objetivo...",
    schema: qualificacaoSchema.shape.objetivo,
    skip: trabalhaFalso,
  },
]

/** Encontra o índice da próxima etapa não pulada, a partir de `fromIndex` (inclusive). */
export function findNextStepIndex(fromIndex: number, answers: SofiaAnswers): number {
  for (let i = fromIndex; i < SOFIA_STEPS.length; i++) {
    const step = SOFIA_STEPS[i]
    if (!step.skip || !step.skip(answers)) return i
  }
  return SOFIA_STEPS.length
}
