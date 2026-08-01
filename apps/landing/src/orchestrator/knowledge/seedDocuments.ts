/**
 * Documentos fictícios de demonstração (RFC-006).
 *
 * Servem SÓ para testar o KnowledgeEngine/KnowledgeRepository nesta fase —
 * não são conteúdo oficial revisado pela empresa e não são consumidos por
 * nenhuma resposta real da Sofia ainda (o fluxo inteiro está desconectado,
 * ver `SofiaOrchestrator`/`ToolEngine`). Uma RFC futura que ligar isso a uma
 * fonte oficial (Supabase, painel de conteúdo) deve substituir este arquivo.
 */
import type { KnowledgeDocument } from "./types"

const AGORA = new Date().toISOString()

export const SEED_KNOWLEDGE_DOCUMENTS: KnowledgeDocument[] = [
  {
    id: "kb-como-funciona-consignacao",
    titulo: "Como funciona a consignação",
    categoria: "CONSIGNACAO",
    conteudo:
      "[Exemplo fictício] A revendedora recebe o mostruário de peças em consignação, sem precisar comprar o estoque antecipadamente. Ela paga apenas pelas peças vendidas, dentro do prazo combinado, e pode devolver o que não vender.",
    tags: ["consignacao", "mostruario", "estoque"],
    palavrasChave: ["consignacao", "consignado", "mostruario", "pagar depois", "devolver"],
    prioridade: 8,
    versao: 1,
    ativo: true,
    criadoEm: AGORA,
    atualizadoEm: AGORA,
  },
  {
    id: "kb-como-funciona-comissao",
    titulo: "Como funciona a comissão",
    categoria: "COMISSOES",
    conteudo:
      "[Exemplo fictício] A revendedora fica com uma margem sobre cada peça vendida, definida pela tabela de preços fornecida no treinamento. Não há desconto em folha nem taxa de adesão — o ganho é sobre a venda.",
    tags: ["comissao", "ganhos", "margem"],
    palavrasChave: ["comissao", "margem", "quanto ganha", "lucro"],
    prioridade: 9,
    versao: 1,
    ativo: true,
    criadoEm: AGORA,
    atualizadoEm: AGORA,
  },
  {
    id: "kb-como-se-cadastrar",
    titulo: "Como se cadastrar",
    categoria: "RECRUTAMENTO",
    conteudo:
      "[Exemplo fictício] O cadastro é feito pela conversa com a Sofia na Landing Page, leva menos de 2 minutos, e depois passa por uma análise da equipe antes da liberação do mostruário.",
    tags: ["cadastro", "inscricao", "sofia"],
    palavrasChave: ["cadastrar", "cadastro", "inscricao", "como comeco"],
    prioridade: 7,
    versao: 1,
    ativo: true,
    criadoEm: AGORA,
    atualizadoEm: AGORA,
  },
  {
    id: "kb-quem-pode-vender",
    titulo: "Quem pode vender",
    categoria: "RECRUTAMENTO",
    conteudo:
      "[Exemplo fictício] Não é necessário ter experiência prévia com vendas nem estar desempregada — a revenda pode ser feita como renda extra, no tempo livre, sem exigência de dedicação exclusiva.",
    tags: ["elegibilidade", "requisitos"],
    palavrasChave: ["quem pode", "preciso de experiencia", "posso participar"],
    prioridade: 6,
    versao: 1,
    ativo: true,
    criadoEm: AGORA,
    atualizadoEm: AGORA,
  },
  {
    id: "kb-quais-cidades-atendemos",
    titulo: "Quais cidades atendemos",
    categoria: "CIDADES",
    conteudo:
      "[Exemplo fictício] O atendimento hoje é focado na região do ABCD paulista. A lista oficial e atualizada de cidades atendidas vive na tabela `settings` (`cidades_atendidas`), não neste documento.",
    tags: ["cidades", "regiao", "abcd"],
    palavrasChave: ["cidade", "regiao", "atende onde", "minha cidade"],
    prioridade: 7,
    versao: 1,
    ativo: true,
    criadoEm: AGORA,
    atualizadoEm: AGORA,
  },
]
