/**
 * extractKeywords (v1 — sem busca semântica, conforme pedido).
 *
 * Resolve o bloqueador confirmado ao vivo: o `KnowledgeEngine.search({texto})`
 * faz correspondência por SUBSTRING — uma pergunta inteira como "Quanto eu
 * ganho de comissão?" nunca aparece literalmente dentro de nenhum
 * documento, então a busca com a frase inteira sempre volta vazia. Uma
 * palavra isolada ("comissao") já funcionava.
 *
 * Esta é a solução mais simples possível: remove pontuação, normaliza
 * (minúsculo, sem acento) e descarta palavras de parada (artigos,
 * preposições, pronomes, interrogativos, verbos auxiliares comuns) — o que
 * sobra são as palavras com maior chance de aparecer literalmente num
 * documento. Não é busca semântica: não entende sinônimos nem
 * reformulações distantes do vocabulário dos documentos. Isso é uma
 * limitação conhecida e aceita nesta primeira versão.
 */

const STOPWORDS = new Set([
  // artigos
  "a", "o", "as", "os", "um", "uma", "uns", "umas",
  // preposições e contrações comuns
  "de", "do", "da", "dos", "das", "em", "no", "na", "nos", "nas", "por", "para", "pra", "pro",
  "com", "sem", "sobre", "ate", "após", "apos", "entre", "durante",
  // conjunções
  "e", "ou", "mas", "que", "se", "porque", "porem", "porém",
  // pronomes
  "eu", "tu", "voce", "você", "ele", "ela", "nos", "vos", "eles", "elas",
  "me", "te", "lhe", "nos", "meu", "minha", "meus", "minhas", "seu", "sua", "seus", "suas",
  "isso", "isto", "aquilo", "essa", "esse", "esta", "este", "essas", "esses", "estas", "estes",
  // interrogativos (viram ruído pra busca por substring — não aparecem no conteúdo dos documentos)
  "quanto", "quantos", "quanta", "quantas", "como", "quando", "onde", "qual", "quais", "quem", "porque",
  // verbos auxiliares / muito comuns
  "e", "sao", "são", "foi", "ser", "estar", "esta", "está", "tem", "ter", "tenho", "vou", "vai",
  "posso", "pode", "podem", "preciso", "precisa", "quero", "quer", "gostaria",
  // advérbios/intensificadores vagos
  "muito", "mais", "menos", "bem", "ja", "já", "ainda", "so", "só", "tambem", "também",
  "nao", "não", "sim", "aqui", "ali", "la", "lá", "hoje", "agora",
])

function normalize(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

/** Comprimento mínimo pra uma palavra sobreviver ao filtro — descarta resíduos de pontuação e palavras curtas demais pra serem específicas. */
const MIN_KEYWORD_LENGTH = 3

/**
 * Extrai as palavras com maior chance de identificar o assunto da pergunta
 * — sem duplicatas, na ordem em que apareceram. `"Quanto eu ganho de
 * comissão?"` → `["ganho", "comissao"]`.
 */
export function extractKeywords(pergunta: string): string[] {
  const semPontuacao = normalize(pergunta).replace(/[?!.,;:()"'/\\]/g, " ")
  const palavras = semPontuacao.split(/\s+/).filter(Boolean)

  const vistas = new Set<string>()
  const keywords: string[] = []
  for (const palavra of palavras) {
    if (palavra.length < MIN_KEYWORD_LENGTH) continue
    if (STOPWORDS.has(palavra)) continue
    if (vistas.has(palavra)) continue
    vistas.add(palavra)
    keywords.push(palavra)
  }

  return keywords
}
