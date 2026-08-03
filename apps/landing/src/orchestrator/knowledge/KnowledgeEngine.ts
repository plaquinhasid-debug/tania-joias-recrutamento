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

/**
 * Comprimento do prefixo comparado pelo stemming leve de `searchByQuestion`
 * (ver `stemMatches` abaixo). Só usado ali — nunca em `search()`.
 */
const STEM_LENGTH = 5

/**
 * Stemming leve (v1 — sem busca semântica, conforme pedido): duas palavras
 * "casam" se os primeiros `STEM_LENGTH` caracteres forem iguais, o que
 * resolve variação de gênero/número em português sem dicionário nenhum
 * ("receb-o" vs. "receb-e", "aprovad-a" vs. "aprovad-o", "primeir-as" vs.
 * "primeir-o"). Corrige o empate confirmado ao vivo na pergunta do
 * "primeiro mostruário": a candidata usa "recebo"/"primeiras"/"aprovada",
 * os documentos usam "recebe"/"primeiro"/"aprovado" — comparação exata
 * nunca batia. Palavras menores que `STEM_LENGTH` (de qualquer um dos dois
 * lados) exigem igualdade exata — prefixo curto demais vira ruído (ex.:
 * "der" não pode "casar" com qualquer palavra que comece com "der").
 */
function stemMatches(keyword: string, palavra: string): boolean {
  if (keyword.length < STEM_LENGTH || palavra.length < STEM_LENGTH) {
    return keyword === palavra
  }
  return keyword.slice(0, STEM_LENGTH) === palavra.slice(0, STEM_LENGTH)
}

/** Quebra um texto normalizado em palavras (separador = qualquer caractere que não seja letra/dígito) — usado só pelo stemming acima, nunca por `search()` (que continua com substring simples). */
function tokenizar(texto: string): string[] {
  return normalize(texto)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/** `true` se alguma palavra do texto "casa" (via stemming) com a palavra-chave. */
function algumaPalavraCasa(texto: string, keyword: string): boolean {
  return tokenizar(texto).some((palavra) => stemMatches(keyword, palavra))
}

/** `true` se a palavra-chave bate (via stemming) em título, conteúdo, tags ou palavrasChave do documento — usado só por `searchByQuestion`, nunca por `search()`. */
function documentoCasaComPalavraChave(documento: KnowledgeDocument, keyword: string): boolean {
  return (
    algumaPalavraCasa(documento.titulo, keyword) ||
    algumaPalavraCasa(documento.conteudo, keyword) ||
    documento.tags.some((tag) => algumaPalavraCasa(tag, keyword)) ||
    documento.palavrasChave.some((p) => algumaPalavraCasa(p, keyword))
  )
}

/**
 * Segundo critério de desempate de `searchByQuestion`, usado só quando dois
 * ou mais documentos empatam em `pontos` (mesma quantidade de
 * palavras-chave batendo em algum lugar) — corrige o empate confirmado ao
 * vivo em "Se a peça der defeito, como funciona?": com-001-consignacao
 * vencia com-003-troca-defeito por "prioridade", mesmo com "defeito" — a
 * palavra mais específica da pergunta — batendo só no corpo do texto de um
 * e no título E no id do outro. Título/id são escritos deliberadamente para
 * resumir o assunto do documento; bater ali é sinal mais forte de
 * relevância do que bater só em conteudo/tags/palavrasChave. Cada palavra
 * conta uma vez por campo (bate nos dois = 2), via o mesmo stemming acima.
 * Nunca decide sozinho — `pontos` continua vindo primeiro no `sort()` — e
 * nunca altera o comportamento de `search()`.
 */
function contarAcertosNoTituloOuId(documento: KnowledgeDocument, keywords: string[]): number {
  let acertos = 0
  for (const keyword of keywords) {
    if (algumaPalavraCasa(documento.titulo, keyword)) acertos += 1
    if (algumaPalavraCasa(documento.id, keyword)) acertos += 1
  }
  return acertos
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

    // Trava estrutural de visibilidade — SEMPRE aplicada primeiro, antes de
    // qualquer outro filtro. `includeInternal` precisa ser passado de forma
    // explícita e deliberada; sem ele, um documento "internal" nunca chega
    // nem à etapa de filtro por categoria/tags/texto, muito menos ao
    // resultado final.
    const ocultados = query.includeInternal ? 0 : documentos.filter((doc) => doc.visibility === "internal").length
    let resultado = query.includeInternal ? documentos : documentos.filter((doc) => doc.visibility === "public")

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
    if (ocultados > 0) {
      log(`Documentos internos ocultados: ${ocultados} (includeInternal não foi solicitado).`)
    }
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

  /** Mesma trava de `search()`: um documento `"internal"` só volta se `includeInternal: true` for passado explicitamente. */
  async findById(id: string, options?: { includeInternal?: boolean }): Promise<KnowledgeDocument | null> {
    const documento = await this.repository.getById(id)
    if (!documento) return null
    if (documento.visibility === "internal" && !options?.includeInternal) {
      log(`Documento "${id}" é internal e includeInternal não foi solicitado — ocultado.`)
      return null
    }
    return documento
  }

  /** Mesma trava de `search()`. */
  async listDocuments(options?: { includeInternal?: boolean }): Promise<KnowledgeDocument[]> {
    const documentos = await this.repository.getAll()
    if (options?.includeInternal) return documentos
    return documentos.filter((doc) => doc.visibility === "public")
  }

  /**
   * Busca a partir de uma PERGUNTA em linguagem natural (v1 — extração de
   * palavras-chave + stemming leve, sem busca semântica). `search({texto})`
   * sozinho falha pra perguntas reais porque exige a frase inteira como
   * substring; aqui extrai as palavras relevantes (`extractKeywords`) e
   * verifica cada uma contra título/conteúdo/tags/palavrasChave de cada
   * documento visível, via `stemMatches` (casa variações de gênero/número,
   * ex. "recebo"/"recebe") — ranqueando por quantas palavras diferentes
   * bateram (`pontos`), com empate resolvido primeiro por acerto em
   * título/id (`contarAcertosNoTituloOuId`) e só depois por `prioridade`.
   */
  async searchByQuestion(
    pergunta: string,
    limite = 3,
    options?: { includeInternal?: boolean },
  ): Promise<KnowledgeDocument[]> {
    const start = Date.now()
    const keywords = extractKeywords(pergunta)

    if (keywords.length === 0) {
      log("Busca por pergunta: nenhuma palavra-chave relevante extraída.", { pergunta })
      return []
    }

    // Mesma trava de visibilidade de `search()` — sem nenhum outro filtro,
    // só pra obter o conjunto de documentos elegíveis.
    const documentosVisiveis = await this.search({ includeInternal: options?.includeInternal })

    const resultado = documentosVisiveis
      .map((documento) => ({
        documento,
        pontos: keywords.filter((keyword) => documentoCasaComPalavraChave(documento, keyword)).length,
        acertosTitulo: contarAcertosNoTituloOuId(documento, keywords),
      }))
      .filter((r) => r.pontos > 0)
      .sort(
        (a, b) =>
          b.pontos - a.pontos || b.acertosTitulo - a.acertosTitulo || b.documento.prioridade - a.documento.prioridade,
      )
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
