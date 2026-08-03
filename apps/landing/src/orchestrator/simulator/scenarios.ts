/**
 * Cenários fictícios de conversa (RFC-007 / RFC-008).
 *
 * Cada cenário é uma lista de `SimulationInputTurn` — o texto que a
 * "candidata" digitaria, na ordem em que digitaria, mais (quando fizer
 * sentido) o `answer` explícito que aquele turno representa. Perguntas,
 * objeções, dúvidas, saudações e despedidas NUNCA levam `answer` — é
 * exatamente essa distinção que a RFC-008 corrigiu (antes, toda mensagem
 * preenchia automaticamente o próximo campo pendente do roteiro).
 *
 * Servem para exercitar o pipeline do Orchestrator (`IntentClassifier` →
 * `DecisionEngine` → `ActionEngine`) sem depender da Landing Page. Não são
 * conversas reais nem conteúdo oficial.
 *
 * `expectedIntent` e o `expected` de cada `ScenarioDefinition` foram
 * conferidos rodando o cenário de verdade contra o Orchestrator real (ver
 * relatório da RFC-008) — não são um palpite, refletem o comportamento
 * observado do `IntentClassifier`/`DecisionEngine` determinísticos de hoje.
 */
import type { ScenarioDefinition, SimulationInputTurn } from "./types"

/** Candidata engajada, responde tudo de forma direta e positiva — completa a entrevista. */
export const SCENARIO_INTERESSADA: SimulationInputTurn[] = [
  { message: "Meu nome é Camila Rodrigues", expectedIntent: "ANSWER", answer: { objective: "nome", value: "Camila Rodrigues" } },
  { message: "Moro em Mauá", expectedIntent: "ANSWER", answer: { objective: "cidade", value: "Mauá" } },
  { message: "Sou cabeleireira", expectedIntent: "ANSWER", answer: { objective: "profissao", value: "Cabeleireira" } },
  { message: "Trabalho em um salão perto de casa", expectedIntent: "ANSWER", answer: { objective: "empresa", value: "Salão de beleza" } },
  {
    message: "Já vendi roupas pra amigas antes, tenho um pouco de experiência",
    expectedIntent: "ANSWER",
    answer: { objective: "experiencia", value: true },
  },
  {
    message: "Tenho Instagram, uso @camila.rodrigues",
    expectedIntent: "ANSWER",
    answer: { objective: "instagram", value: "@camila.rodrigues" },
  },
  { message: "Tenho WhatsApp", expectedIntent: "ANSWER", answer: { objective: "whatsapp", value: true } },
  {
    message: "Quero ganhar uma renda extra pra ajudar em casa",
    expectedIntent: "ANSWER",
    answer: { objective: "motivacao", value: "Renda extra para ajudar em casa" },
  },
  {
    message: "Consigo dedicar umas 2 horas por dia",
    expectedIntent: "ANSWER",
    answer: { objective: "tempo", value: "2 horas por dia" },
  },
]

export const SCENARIO_INTERESSADA_DEFINITION: ScenarioDefinition = {
  name: "INTERESSADA",
  turns: SCENARIO_INTERESSADA,
  expected: {
    outcome: "COMPLETED",
    intents: Array(9).fill("ANSWER"),
    decisions: [...Array(8).fill("CONTINUE_FLOW"), "FINALIZE"],
    completedObjectives: [
      "nome",
      "cidade",
      "profissao",
      "empresa",
      "experiencia",
      "instagram",
      "whatsapp",
      "motivacao",
      "tempo",
    ],
    pendingObjectives: [],
  },
}

/** Candidata sem nenhuma experiência prévia com vendas — mesmo assim completa a entrevista. */
export const SCENARIO_SEM_EXPERIENCIA: SimulationInputTurn[] = [
  { message: "Meu nome é Juliana Alves", expectedIntent: "ANSWER", answer: { objective: "nome", value: "Juliana Alves" } },
  { message: "Sou de Santo André", expectedIntent: "ANSWER", answer: { objective: "cidade", value: "Santo André" } },
  { message: "Sou professora", expectedIntent: "ANSWER", answer: { objective: "profissao", value: "Professora" } },
  {
    message: "Dou aulas numa escola municipal",
    expectedIntent: "ANSWER",
    answer: { objective: "empresa", value: "Escola municipal" },
  },
  {
    message: "Nunca vendi nada na vida, não tenho experiência",
    expectedIntent: "ANSWER",
    answer: { objective: "experiencia", value: false },
  },
  { message: "Não tenho Instagram", expectedIntent: "ANSWER", answer: { objective: "instagram", value: null } },
  { message: "Tenho WhatsApp sim", expectedIntent: "ANSWER", answer: { objective: "whatsapp", value: true } },
  {
    message: "Quero uma renda extra",
    expectedIntent: "ANSWER",
    answer: { objective: "motivacao", value: "Renda extra" },
  },
  {
    message: "1 hora por dia, no máximo",
    expectedIntent: "ANSWER",
    answer: { objective: "tempo", value: "1 hora por dia" },
  },
]

export const SCENARIO_SEM_EXPERIENCIA_DEFINITION: ScenarioDefinition = {
  name: "SEM_EXPERIENCIA",
  turns: SCENARIO_SEM_EXPERIENCIA,
  expected: {
    outcome: "COMPLETED",
    intents: Array(9).fill("ANSWER"),
    decisions: [...Array(8).fill("CONTINUE_FLOW"), "FINALIZE"],
    completedObjectives: [
      "nome",
      "cidade",
      "profissao",
      "empresa",
      "experiencia",
      "instagram",
      "whatsapp",
      "motivacao",
      "tempo",
    ],
    pendingObjectives: [],
  },
}

/**
 * Candidata com várias dúvidas antes de conseguir responder. Só 3 dos 9
 * objetivos são de fato preenchidos — as dúvidas e perguntas nunca avançam
 * o roteiro (é exatamente o bug que a RFC-008 corrigiu: na versão anterior
 * do Simulator, esse cenário chegava a 89% de progresso por engano).
 */
export const SCENARIO_MUITAS_DUVIDAS: SimulationInputTurn[] = [
  { message: "Meu nome é Renata", expectedIntent: "ANSWER", answer: { objective: "nome", value: "Renata" } },
  {
    message: "Moro em São Bernardo do Campo",
    expectedIntent: "ANSWER",
    answer: { objective: "cidade", value: "São Bernardo do Campo" },
  },
  { message: "Não entendi como funciona a consignação", expectedIntent: "DOUBT" },
  { message: "Como assim, eu preciso comprar as peças antes?", expectedIntent: "QUESTION" },
  { message: "Quanto eu ganho por peça vendida?", expectedIntent: "QUESTION" },
  { message: "Ainda não ficou claro pra mim como recebo o dinheiro", expectedIntent: "DOUBT" },
  { message: "Ok, agora entendi melhor", expectedIntent: "ANSWER" },
  { message: "Sou enfermeira", expectedIntent: "ANSWER", answer: { objective: "profissao", value: "Enfermeira" } },
]

export const SCENARIO_MUITAS_DUVIDAS_DEFINITION: ScenarioDefinition = {
  name: "MUITAS_DUVIDAS",
  turns: SCENARIO_MUITAS_DUVIDAS,
  expected: {
    outcome: "IN_PROGRESS",
    intents: ["ANSWER", "ANSWER", "DOUBT", "QUESTION", "QUESTION", "DOUBT", "ANSWER", "ANSWER"],
    decisions: [
      "CONTINUE_FLOW",
      "CONTINUE_FLOW",
      "REGISTER_DOUBT",
      "ANSWER_WITH_TOOL",
      "ANSWER_WITH_TOOL",
      "REGISTER_DOUBT",
      "CONTINUE_FLOW",
      "CONTINUE_FLOW",
    ],
    completedObjectives: ["nome", "cidade", "profissao"],
    pendingObjectives: ["empresa", "experiencia", "instagram", "whatsapp", "motivacao", "tempo"],
  },
}

/** Candidata insegura, levanta objeções e uma pergunta antes de topar continuar — nenhuma delas preenche objetivo. */
export const SCENARIO_OBJECAO: SimulationInputTurn[] = [
  { message: "Meu nome é Patrícia", expectedIntent: "ANSWER", answer: { objective: "nome", value: "Patrícia" } },
  {
    message: "Sou de São Caetano do Sul",
    expectedIntent: "ANSWER",
    answer: { objective: "cidade", value: "São Caetano do Sul" },
  },
  { message: "Tenho medo de não conseguir vender", expectedIntent: "OBJECTION" },
  { message: "Será que eu consigo mesmo, sem nunca ter vendido nada?", expectedIntent: "QUESTION" },
  { message: "É meio complicado pra mim, não sei se dou conta", expectedIntent: "OBJECTION" },
  { message: "Acho que vou tentar mesmo assim", expectedIntent: "ANSWER" },
]

export const SCENARIO_OBJECAO_DEFINITION: ScenarioDefinition = {
  name: "OBJECAO",
  turns: SCENARIO_OBJECAO,
  expected: {
    outcome: "IN_PROGRESS",
    intents: ["ANSWER", "ANSWER", "OBJECTION", "QUESTION", "OBJECTION", "ANSWER"],
    decisions: [
      "CONTINUE_FLOW",
      "CONTINUE_FLOW",
      "REGISTER_OBJECTION",
      "ANSWER_WITH_TOOL",
      "REGISTER_OBJECTION",
      "CONTINUE_FLOW",
    ],
    completedObjectives: ["nome", "cidade"],
    pendingObjectives: ["profissao", "empresa", "experiencia", "instagram", "whatsapp", "motivacao", "tempo"],
  },
}

/** Candidata desiste no meio da conversa — termina como ABANDONED, não COMPLETED. */
export const SCENARIO_DESISTENCIA: SimulationInputTurn[] = [
  { message: "Meu nome é Fernanda", expectedIntent: "ANSWER", answer: { objective: "nome", value: "Fernanda" } },
  { message: "Moro em Mauá", expectedIntent: "ANSWER", answer: { objective: "cidade", value: "Mauá" } },
  { message: "Na verdade acho que não vou continuar", expectedIntent: "ANSWER" },
  { message: "Obrigada, mas não é pra mim agora", expectedIntent: "END_CONVERSATION" },
  { message: "Tchau", expectedIntent: "END_CONVERSATION" },
]

export const SCENARIO_DESISTENCIA_DEFINITION: ScenarioDefinition = {
  name: "DESISTENCIA",
  turns: SCENARIO_DESISTENCIA,
  expected: {
    outcome: "ABANDONED",
    intents: ["ANSWER", "ANSWER", "ANSWER", "END_CONVERSATION", "END_CONVERSATION"],
    decisions: ["CONTINUE_FLOW", "CONTINUE_FLOW", "CONTINUE_FLOW", "FINALIZE", "FINALIZE"],
    completedObjectives: ["nome", "cidade"],
    pendingObjectives: ["profissao", "empresa", "experiencia", "instagram", "whatsapp", "motivacao", "tempo"],
  },
}

/**
 * Candidata pergunta 2 dúvidas reais de negócio (uma coberta pela base de
 * conhecimento oficial, outra não) antes de continuar a entrevista
 * (FEATURE-003, Objetivo 8) — confirma que o `IntentClassifier`/
 * `DecisionEngine` continuam roteando essas perguntas pra
 * `ANSWER_WITH_TOOL` mesmo com perguntas de negócio de verdade, não só
 * frases fictícias. O `answerCandidateQuestion()` em si (KnowledgeEngine →
 * AIGateway → ResponseComposer) não é chamado pelo Simulator — ele ainda
 * não está conectado ao `SofiaOrchestrator` (ver `answerCandidateQuestion.examples.ts`
 * pra testes do pipeline propriamente dito).
 */
export const SCENARIO_PERGUNTAS_CONHECIMENTO: SimulationInputTurn[] = [
  { message: "Meu nome é Beatriz Souza", expectedIntent: "ANSWER", answer: { objective: "nome", value: "Beatriz Souza" } },
  { message: "Moro em São Bernardo do Campo", expectedIntent: "ANSWER", answer: { objective: "cidade", value: "São Bernardo do Campo" } },
  { message: "Quanto eu ganho de comissão?", expectedIntent: "QUESTION" },
  { message: "Vocês têm alguma promoção de Natal esse ano?", expectedIntent: "QUESTION" },
  { message: "Sou bancária", expectedIntent: "ANSWER", answer: { objective: "profissao", value: "Bancária" } },
]

export const SCENARIO_PERGUNTAS_CONHECIMENTO_DEFINITION: ScenarioDefinition = {
  name: "PERGUNTAS_CONHECIMENTO",
  turns: SCENARIO_PERGUNTAS_CONHECIMENTO,
  expected: {
    outcome: "IN_PROGRESS",
    intents: ["ANSWER", "ANSWER", "QUESTION", "QUESTION", "ANSWER"],
    decisions: ["CONTINUE_FLOW", "CONTINUE_FLOW", "ANSWER_WITH_TOOL", "ANSWER_WITH_TOOL", "CONTINUE_FLOW"],
    completedObjectives: ["nome", "cidade", "profissao"],
    pendingObjectives: ["empresa", "experiencia", "instagram", "whatsapp", "motivacao", "tempo"],
  },
}

export const SCENARIOS = {
  INTERESSADA: SCENARIO_INTERESSADA,
  SEM_EXPERIENCIA: SCENARIO_SEM_EXPERIENCIA,
  MUITAS_DUVIDAS: SCENARIO_MUITAS_DUVIDAS,
  OBJECAO: SCENARIO_OBJECAO,
  DESISTENCIA: SCENARIO_DESISTENCIA,
  PERGUNTAS_CONHECIMENTO: SCENARIO_PERGUNTAS_CONHECIMENTO,
} as const

export type ScenarioName = keyof typeof SCENARIOS

export const SCENARIO_DEFINITIONS = {
  INTERESSADA: SCENARIO_INTERESSADA_DEFINITION,
  SEM_EXPERIENCIA: SCENARIO_SEM_EXPERIENCIA_DEFINITION,
  MUITAS_DUVIDAS: SCENARIO_MUITAS_DUVIDAS_DEFINITION,
  OBJECAO: SCENARIO_OBJECAO_DEFINITION,
  DESISTENCIA: SCENARIO_DESISTENCIA_DEFINITION,
  PERGUNTAS_CONHECIMENTO: SCENARIO_PERGUNTAS_CONHECIMENTO_DEFINITION,
} as const satisfies Record<ScenarioName, ScenarioDefinition>
