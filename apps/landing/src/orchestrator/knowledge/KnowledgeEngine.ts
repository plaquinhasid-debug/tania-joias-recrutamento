/**
 * KnowledgeEngine (RFC-006).
 *
 * Localiza conhecimento institucional já estruturado como `KnowledgeDocument`
 * — nunca conversa com IA, nunca gera texto, nunca decide o que responder.
 * Quem responde a candidata (futuramente) é a IA, usando os documentos que
 * este Engine encontrar como base; aqui só existe busca.
 *
 * Não acessa banco diretamente: delega tudo a um `KnowledgeRepository`
 * injetado no construtor. Trocar a fonte dos dados (memória → Supabase, por
 * exemplo) nunca exige mudar este arquivo.
 */
import { createLogger } from "../devLog"
import { extractKeywords } from "./extractKeywords"
import { InMemoryKnowledgeRepository } from "./KnowledgeRepository"
import type { KnowledgeRepository } from "./KnowledgeRepository"
import { SEED_KNOWLEDGE_DOCUMENTS } from "./seedDocuments"
import type { KnowledgeCategory, KnowledgeDocument, KnowledgeSearchQuery } from "./types"

const log = createLogger("[KnowledgeEngine]")

function normalize(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

export class KnowledgeEngine {
  private readonly repository: KnowledgeRepository

  constructor(repository: KnowledgeRepository) {
    this.repository = repository
  }

  /**
   * Busca genérica — combina todos os filtros informados (categoria, tags,
   * palavras-chave, texto livre) e devolve os documentos ordenados por
   * prioridade (maior primeiro). Todos os métodos `find*` abaixo são só
   * atalhos para chamadas comuns deste método.
   */
  async search(query: KnowledgeSearchQuery): Promise<KnowledgeDocument[]> {
    const start = Date.now()
    const documentos = await this.repository.getAll()

    let resultado = documentos

    if (query.categoria) {
      resultado = resultado.filter((doc) => doc.categoria === query.categoria)
    }

    if (query.tags?.length) {
      const tagsAlvo = query.tags.map(normalize)
      resultado = resultado.filter((doc) => doc.tags.some((tag) => tagsAlvo.includes(normalize(tag))))
    }

    if (query.palavrasChave?.length) {
      const palavrasAlvo = query.palavrasChave.map(normalize)
      resultado = resultado.filter((doc) => doc.palavrasChave.some((p) => palavrasAlvo.includes(normalize(p))))
    }

    if (query.texto) {
      const termo = normalize(query.texto)
      resultado = resultado.filter(
        (doc) =>
          normalize(doc.titulo).includes(termo) ||
          normalize(doc.conteudo).includes(termo) ||
          doc.tags.some((tag) => normalize(tag).includes(termo)) ||
          doc.palavrasChave.some((p) => normalize(p).includes(termo)),
      )
    }

    resultado = [...resultado].sort((a, b) => b.prioridade - a.prioridade)

    if (query.limite) {
      resultado = resultado.slice(0, query.limite)
    }

    log("Busca realizada")
    log("Categoria:", query.categoria ?? "(todas)")
    log("Tags:", query.tags ?? [])
    log("Quantidade encontrada:", resultado.length)
    log(`Tempo: ${Date.now() - start}ms`)

    return resultado
  }

  async findByCategory(categoria: KnowledgeCategory): Promise<KnowledgeDocument[]> {
    return this.search({ categoria })
  }

  async findByTags(tags: string[]): Promise<KnowledgeDocument[]> {
    return this.search({ tags })
  }

  async findByKeywords(palavrasChave: string[]): Promise<KnowledgeDocument[]> {
    return this.search({ palavrasChave })
  }

  async findById(id: string): Promise<KnowledgeDocument | null> {
    return this.repository.getById(id)
  }

  async listDocuments(): Promise<KnowledgeDocument[]> {
    return this.repository.getAll()
  }

  /**
   * Busca a partir de uma PERGUNTA em linguagem natural (v1 — extração de
   * palavras-chave, sem busca semântica). `search({texto})` sozinho falha
   * pra perguntas reais porque exige a frase inteira como substring; aqui
   * extrai as palavras relevantes (`extractKeywords`) e busca cada uma
   * separadamente, unindo os resultados e ranqueando por quantas palavras
   * diferentes bateram em cada documento (desempate por prioridade).
   */
  async searchByQuestion(pergunta: string, limite = 3): Promise<KnowledgeDocument[]> {
    const start = Date.now()
    const keywords = extractKeywords(pergunta)

    if (keywords.length === 0) {
      log("Busca por pergunta: nenhuma palavra-chave relevante extraída.", { pergunta })
      return []
    }

    const pontosPorId = new Map<string, { documento: KnowledgeDocument; pontos: number }>()
    for (const keyword of keywords) {
      const encontrados = await this.search({ texto: keyword })
      for (const documento of encontrados) {
        const atual = pontosPorId.get(documento.id)
        if (atual) {
          atual.pontos += 1
        } else {
          pontosPorId.set(documento.id, { documento, pontos: 1 })
        }
      }
    }

    const resultado = [...pontosPorId.values()]
      .sort((a, b) => b.pontos - a.pontos || b.documento.prioridade - a.documento.prioridade)
      .slice(0, limite)
      .map((r) => r.documento)

    log("Busca por pergunta realizada")
    log("Pergunta:", pergunta)
    log("Palavras-chave extraídas:", keywords)
    log("Quantidade encontrada:", resultado.length)
    log(`Tempo: ${Date.now() - start}ms`)

    return resultado
  }
}

/**
 * Fábrica com a configuração padrão desta fase: repositório em memória,
 * carregado com os documentos fictícios de demonstração. Trocar para
 * Supabase no futuro = trocar só esta função (ver `KnowledgeRepository.ts`).
 */
export function createDefaultKnowledgeEngine(): KnowledgeEngine {
  return new KnowledgeEngine(new InMemoryKnowledgeRepository(SEED_KNOWLEDGE_DOCUMENTS))
}
