/**
 * Cenários fictícios de conversa (RFC-007).
 *
 * Cada cenário é só um array de mensagens — o texto que a "candidata"
 * digitaria, na ordem em que digitaria. Servem para exercitar o pipeline do
 * Orchestrator (`IntentClassifier` → `DecisionEngine` → `ActionEngine`) sem
 * depender da Landing Page. Não são conversas reais nem conteúdo oficial.
 */

/** Candidata engajada, responde tudo de forma direta e positiva. */
export const SCENARIO_INTERESSADA: string[] = [
  "Meu nome é Camila Rodrigues",
  "Moro em Mauá",
  "Sou cabeleireira",
  "Trabalho em um salão perto de casa",
  "Já vendi roupas pra amigas antes, tenho um pouco de experiência",
  "Tenho Instagram sim, @camila.rodrigues",
  "Tenho WhatsApp",
  "Quero ganhar uma renda extra pra ajudar em casa",
  "Consigo dedicar umas 2 horas por dia",
]

/** Candidata sem nenhuma experiência prévia com vendas. */
export const SCENARIO_SEM_EXPERIENCIA: string[] = [
  "Meu nome é Juliana Alves",
  "Sou de Santo André",
  "Sou professora",
  "Dou aulas numa escola municipal",
  "Nunca vendi nada na vida, não tenho experiência",
  "Não tenho Instagram",
  "Tenho WhatsApp sim",
  "Quero uma renda extra",
  "1 hora por dia, no máximo",
]

/** Candidata com várias dúvidas antes de conseguir responder. */
export const SCENARIO_MUITAS_DUVIDAS: string[] = [
  "Meu nome é Renata",
  "Moro em São Bernardo do Campo",
  "Não entendi como funciona a consignação",
  "Como assim, eu preciso comprar as peças antes?",
  "Quanto eu ganho por peça vendida?",
  "Ainda não ficou claro pra mim como recebo o dinheiro",
  "Ok, agora entendi melhor",
  "Sou enfermeira",
]

/** Candidata insegura, levanta objeções antes de topar continuar. */
export const SCENARIO_OBJECAO: string[] = [
  "Meu nome é Patrícia",
  "Sou de São Caetano do Sul",
  "Tenho medo de não conseguir vender",
  "Será que eu consigo mesmo, sem nunca ter vendido nada?",
  "É meio complicado pra mim, não sei se dou conta",
  "Acho que vou tentar mesmo assim",
]

/** Candidata desiste no meio da conversa. */
export const SCENARIO_DESISTENCIA: string[] = [
  "Meu nome é Fernanda",
  "Moro em Mauá",
  "Na verdade acho que não vou continuar",
  "Obrigada, mas não é pra mim agora",
  "Tchau",
]

export const SCENARIOS = {
  INTERESSADA: SCENARIO_INTERESSADA,
  SEM_EXPERIENCIA: SCENARIO_SEM_EXPERIENCIA,
  MUITAS_DUVIDAS: SCENARIO_MUITAS_DUVIDAS,
  OBJECAO: SCENARIO_OBJECAO,
  DESISTENCIA: SCENARIO_DESISTENCIA,
} as const

export type ScenarioName = keyof typeof SCENARIOS
