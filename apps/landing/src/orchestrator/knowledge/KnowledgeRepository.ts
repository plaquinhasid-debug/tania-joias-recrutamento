/**
 * KnowledgeRepository (RFC-006).
 *
 * Abstrai ONDE os documentos de conhecimento vivem. O `KnowledgeEngine`
 * conhece só esta interface — nunca sabe se os dados vêm de um array em
 * memória, do Supabase, de um arquivo, ou de qualquer outra fonte futura.
 * Trocar de fonte = trocar a implementação injetada no Engine, sem alterar
 * uma linha do Engine.
 *
 * Métodos são `async` mesmo na implementação em memória de propósito: assim
 * uma implementação futura baseada em Supabase (com uma consulta de rede de
 * verdade) satisfaz a mesma interface sem exigir nenhuma mudança de
 * assinatura.
 */
import type { KnowledgeDocument } from "./types"

export interface KnowledgeRepository {
  getAll(): Promise<KnowledgeDocument[]>
  getById(id: string): Promise<KnowledgeDocument | null>
}

/**
 * Implementação em memória (única permitida nesta RFC). Só considera
 * documentos `ativo: true` — um documento desativado nunca aparece em busca,
 * mas continua existindo (histórico/versão).
 */
export class InMemoryKnowledgeRepository implements KnowledgeRepository {
  private readonly documents: KnowledgeDocument[]

  constructor(documents: KnowledgeDocument[]) {
    this.documents = documents
  }

  async getAll(): Promise<KnowledgeDocument[]> {
    return this.documents.filter((doc) => doc.ativo)
  }

  async getById(id: string): Promise<KnowledgeDocument | null> {
    return this.documents.find((doc) => doc.id === id && doc.ativo) ?? null
  }
}
