import { supabase } from "@/lib/supabase"
import type { KnowledgeRepository } from "./KnowledgeRepository"
import { parseRemoteKnowledgeItems } from "./ShadowKnowledgeCore"
import type { KnowledgeDocument } from "./types"

export class SupabaseRemoteKnowledgeRepository implements KnowledgeRepository {
  async getAll(): Promise<KnowledgeDocument[]> {
    const { data, error } = await supabase.functions.invoke("knowledge-service", { body: {} })
    if (error) throw new Error("remote_unavailable")
    return parseRemoteKnowledgeItems(data).map((item) => ({
      id: item.slug,
      titulo: item.title,
      categoria: item.category,
      conteudo: item.content,
      tags: [],
      palavrasChave: [],
      prioridade: 0,
      visibility: "public",
      versao: item.version,
      ativo: true,
      criadoEm: "",
      atualizadoEm: "",
    }))
  }

  async getById(id: string): Promise<KnowledgeDocument | null> {
    return (await this.getAll()).find((doc) => doc.id === id) ?? null
  }
}
