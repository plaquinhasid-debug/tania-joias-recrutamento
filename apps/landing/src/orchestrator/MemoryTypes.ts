/**
 * Tipos de memória preparados para fases futuras (RFC-003).
 *
 * Só `WorkingMemory.ts` tem implementação real nesta fase. Os tipos abaixo
 * existem só como estrutura preparada — nada os popula ou consome ainda.
 */

/**
 * Memória de médio prazo dentro da MESMA conversa (ex.: um resumo
 * condensado dos turnos anteriores, para caber no contexto de um modelo de
 * IA sem reenviar tudo). Ainda não implementada.
 */
export interface ConversationMemory {
  resumoConversa?: string
  turnosResumidos?: number
}

/**
 * Conhecimento de negócio persistente entre candidatas diferentes (ex.:
 * padrões aprendidos sobre quais respostas tendem a indicar bom perfil).
 * Ainda não implementada — exigiria persistência fora do navegador.
 */
export interface BusinessMemory {
  padroesAprendidos?: unknown[]
}

/**
 * Memória entre sessões da MESMA candidata (ex.: ela volta depois de
 * abandonar a conversa). Ainda não implementada — exigiria identificar a
 * candidata entre sessões e persistir fora do navegador.
 */
export interface LongTermMemory {
  candidataId?: string
  interacoesAnteriores?: unknown[]
}
