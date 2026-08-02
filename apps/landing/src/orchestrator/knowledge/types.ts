/**
 * Tipos do Knowledge Engine (RFC-006).
 *
 * Objetivo da camada: tirar conhecimento institucional (regras da empresa,
 * FAQ, política de comissão etc.) de dentro de prompts/código e representá-lo
 * como dado estruturado, pesquisável. Ninguém aqui gera texto nem conversa
 * com IA — só localiza documentos.
 */

/**
 * Categorias conhecidas hoje. O tipo `KnowledgeCategory` abaixo aceita
 * qualquer string nova além destas — a lista serve para autocomplete e para
 * os documentos de exemplo, não é um limite fechado (ver `types.ts` de
 * `IntentType`/`DecisionType` para contraste: aqueles são vocabulários
 * fechados de propósito; categorias de conhecimento institucional crescem
 * com o negócio, então aqui o vocabulário fica aberto).
 */
export const KNOWLEDGE_CATEGORIES = [
  "EMPRESA",
  "RECRUTAMENTO",
  "CONSIGNACAO",
  "GANHOS",
  "COMISSOES",
  "PRODUTOS",
  "GARANTIA",
  "PAGAMENTO",
  "ENTREGA",
  "CIDADES",
  "OBJECOES",
  "FAQ",
  "OUTROS",
] as const

export type KnownKnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number]

/** Aceita as categorias conhecidas (autocomplete) ou qualquer string nova. */
export type KnowledgeCategory = KnownKnowledgeCategory | (string & {})

/**
 * Trava estrutural de visibilidade (adicionada a pedido explícito, ver
 * relatório da sessão): `"public"` pode ser retornado por busca e usado num
 * prompt de IA; `"internal"` NUNCA pode — mesmo que alguém carregue um
 * documento interno no repositório por engano no futuro, o `KnowledgeEngine`
 * filtra por padrão em TODO método de leitura (`search`, `findById`,
 * `listDocuments`, `searchByQuestion`), não só nos que "parecem" busca. Só
 * sai um documento interno se o chamador passar `{ includeInternal: true }`
 * explicitamente — nenhum ponto do FEATURE-003/AIGateway planejado faz isso.
 */
export type KnowledgeVisibility = "public" | "internal"

export interface KnowledgeDocument {
  id: string
  titulo: string
  categoria: KnowledgeCategory
  conteudo: string
  tags: string[]
  /** Termos usados na busca por palavra-chave — já normalizados (minúsculo, sem acento) na origem. */
  palavrasChave: string[]
  /** Maior = mais relevante quando vários documentos batem na mesma busca. */
  prioridade: number
  /** Ver `KnowledgeVisibility` — campo obrigatório de propósito, não tem default implícito. */
  visibility: KnowledgeVisibility
  versao: number
  ativo: boolean
  criadoEm: string
  atualizadoEm: string
}

export interface KnowledgeSearchQuery {
  /** Busca livre em título/conteúdo/tags/palavras-chave. */
  texto?: string
  categoria?: KnowledgeCategory
  tags?: string[]
  palavrasChave?: string[]
  /** Máximo de documentos retornados, já ordenados por prioridade. */
  limite?: number
  /** `true` inclui documentos `visibility: "internal"` no resultado — opt-in explícito, nunca o padrão. */
  includeInternal?: boolean
}
