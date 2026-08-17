/**
 * Documentos OFICIAIS da base de conhecimento (substituem os fictícios da
 * RFC-006). Fonte: `docs/knowledge/COM-001` a `COM-004`, revisados por
 * Antonio (proprietário) — arquivos originais preservados na íntegra em
 * `docs/knowledge/`, este arquivo é a versão COMPILADA (prosa limpa, sem
 * markdown) pronta para entrar num prompt de IA quando o KnowledgeEngine
 * for conectado.
 *
 * O fluxo continua desconectado nesta fase (ver `SofiaOrchestrator`/
 * `ToolEngine`/FEATURE-003, pausada) — carregar conteúdo oficial aqui não
 * muda isso; é só o primeiro passo para a FEATURE-003 ter o que responder.
 *
 * COM-002 está na v1.2 (`docs/knowledge/COM-002-recrutamento.md`): a v1.1
 * resolveu as duas divergências da v1.0 — "Ribeirão Pires" incluída nas
 * cidades atendidas (agora bate com o setting `cidades_atendidas` em
 * produção) e o critério de filhos/estado civil removido (reintrodução por
 * engano na v1.0; conflitava com decisão anterior de não usar gênero/número
 * de filhos como critério, por risco de discriminação). A v1.2
 * (RFC-INTELLIGENCE-005/006) corrigiu três divergências encontradas contra
 * o Knowledge Layer oficial: idade mínima era comunicada como "21 anos" (o
 * correto é 18); Instagram era comunicado como obrigatório junto ao
 * WhatsApp (só WhatsApp é obrigatório; Instagram é opcional); e a atividade
 * profissional aceita era comunicada de forma mais estreita
 * (empresa/escola/hospital/cabeleireira) do que a regra real, que também
 * aceita autônoma/comerciante/dona do próprio negócio/qualquer ocupação
 * real. O critério de gênero ("ser mulher") foi removido do texto — nunca
 * foi implementado como regra executável em nenhum ponto do sistema (RFC-
 * INTELLIGENCE-005/006), e não deve virar gate agora.
 *
 * `com-001-consignacao` está na versão 2 (RFC-INTELLIGENCE-007): o texto
 * comunicava o ciclo de "30 dias" de forma mais rígida do que o Knowledge
 * Layer oficial, que trata o prazo como referência flexível, sujeita a
 * reagendamento combinado — corrigido junto com `docs/knowledge/COM-001...md`
 * v1.1. Nenhuma lógica de prazo/timer foi criada — é só correção de texto.
 *
 * TODOS os documentos abaixo são `visibility: "public"` — é conteúdo
 * seguro pra candidata ler ou pra entrar num prompt de IA. A seção
 * "Critério de reprovação" do COM-002 v1.1 (só resta "desempregada")
 * continua fora daqui — o próprio documento marca isso como "uso interno,
 * não expor diretamente à candidata", e a mensagem exata de reprovação já
 * foi definida e vive em `apps/landing/src/data/sofia-script.ts`
 * (`SOFIA_REJECTION_LINES`), fora do KnowledgeEngine — é texto hardcoded do
 * roteiro, nunca passa por IA. A informação positiva equivalente ("estar
 * trabalhando") já está em `com-002-elegibilidade`, então nenhuma
 * informação útil pra candidata fica de fora.
 */
import type { KnowledgeDocument } from "./types"

const AGORA = new Date().toISOString()

export const SEED_KNOWLEDGE_DOCUMENTS: KnowledgeDocument[] = [
  {
    id: "com-001-consignacao",
    titulo: "Como funciona a consignação",
    categoria: "CONSIGNACAO",
    conteudo:
      "A revendedora recebe um mostruário de peças sem pagar nada adiantado. O acerto costuma acontecer em torno de 30 dias — esse período é uma referência, não um prazo rígido: pode ser antecipado, adiado ou reagendado, desde que combinado com a equipe. No acerto, ela paga à Tania Joias apenas as peças que vendeu (já com a comissão descontada) e devolve as peças que não vendeu. Em seguida recebe um novo mostruário e o ciclo recomeça.",
    tags: ["consignacao", "mostruario", "ciclo"],
    palavrasChave: ["consignacao", "mostruario", "prazo", "30 dias", "acerto", "devolucao", "pagar antes", "adiantado", "reagendar", "prazo flexivel"],
    prioridade: 9,
    visibility: "public",
    versao: 2,
    ativo: true,
    criadoEm: AGORA,
    atualizadoEm: AGORA,
  },
  {
    id: "com-001-comissao",
    titulo: "Quanto a revendedora ganha de comissão",
    categoria: "COMISSOES",
    conteudo:
      "A comissão da revendedora varia de 30% a 40%, dependendo do valor total vendido em cada acerto: até R$ 299,00 a comissão é de 30%; de R$ 299,00 a R$ 399,00 é de 35%; a partir de R$ 400,00 é de 40%. Quanto mais a revendedora vende em cada ciclo, maior a porcentagem que ela recebe.",
    tags: ["comissao", "ganhos"],
    palavrasChave: ["comissao", "porcentagem", "quanto ganho", "tabela", "faixa", "valor vendido"],
    prioridade: 10,
    visibility: "public",
    versao: 1,
    ativo: true,
    criadoEm: AGORA,
    atualizadoEm: AGORA,
  },
  {
    id: "com-001-garantia",
    titulo: "Garantia das peças",
    categoria: "GARANTIA",
    conteudo:
      "As peças têm garantia: anéis têm garantia de 3 meses; as demais peças (colares, brincos, pulseiras, etc.) têm garantia de até 6 meses.",
    tags: ["garantia", "prazo"],
    palavrasChave: ["garantia", "defeito", "prazo de garantia", "anel", "colar", "brinco", "quanto tempo"],
    prioridade: 8,
    visibility: "public",
    versao: 1,
    ativo: true,
    criadoEm: AGORA,
    atualizadoEm: AGORA,
  },
  {
    id: "com-002-elegibilidade",
    titulo: "Quem pode ser revendedora",
    categoria: "RECRUTAMENTO",
    conteudo:
      "Para se tornar revendedora da Tania Joias é necessário: ter 18 anos completos ou mais; morar em Mauá, Ribeirão Pires, Santo André, São Bernardo do Campo ou São Caetano do Sul; ter WhatsApp (Instagram é bem-vindo, mas não obrigatório); e estar trabalhando ou exercer alguma atividade profissional ativa — pode ser como funcionária, autônoma, comerciante ou em qualquer outra ocupação real.",
    tags: ["elegibilidade", "requisitos"],
    palavrasChave: ["requisitos", "posso ser revendedora", "cidade atendida", "idade minima", "precisa trabalhar", "ribeirao pires", "autonoma", "instagram obrigatorio"],
    prioridade: 9,
    visibility: "public",
    versao: 3,
    ativo: true,
    criadoEm: AGORA,
    atualizadoEm: AGORA,
  },
  {
    id: "com-002-processo-candidatura",
    titulo: "Como funciona o processo de candidatura",
    categoria: "RECRUTAMENTO",
    conteudo:
      "A candidata preenche um cadastro com suas informações. A partir daí a Tania Joias avalia se ela atende aos critérios antes de liberar o primeiro mostruário.",
    tags: ["cadastro", "processo"],
    palavrasChave: ["como me inscrevo", "cadastro", "proximo passo", "depois que eu preencher"],
    prioridade: 6,
    visibility: "public",
    versao: 1,
    ativo: true,
    criadoEm: AGORA,
    atualizadoEm: AGORA,
  },
  {
    id: "com-003-troca-defeito",
    titulo: "Troca por defeito",
    categoria: "GARANTIA",
    conteudo:
      "Se uma peça apresentar defeito, a revendedora devolve a peça diretamente para a Tania Joias e a troca é feita por lá. Na primeira troca não há cobrança de frete. A partir da segunda troca, passa a haver cobrança de frete/envio (correção do COM-004 sobre o COM-003 original).",
    tags: ["troca", "defeito", "frete"],
    palavrasChave: ["defeito", "troca", "peca quebrada", "devolver defeito", "frete"],
    prioridade: 7,
    visibility: "public",
    versao: 2,
    ativo: true,
    criadoEm: AGORA,
    atualizadoEm: AGORA,
  },
  {
    id: "com-003-nao-coberto-garantia",
    titulo: "O que não é coberto pela garantia",
    categoria: "GARANTIA",
    conteudo: "Não são cobertos pela garantia: quebra por mau uso e oxidação por mau uso.",
    tags: ["garantia", "exclusao"],
    palavrasChave: ["o que nao e garantia", "mau uso", "oxidacao", "quebrou", "nao cobre"],
    prioridade: 6,
    visibility: "public",
    versao: 1,
    ativo: true,
    criadoEm: AGORA,
    atualizadoEm: AGORA,
  },
  {
    id: "com-004-primeiro-mostruario",
    titulo: "Primeiro mostruário",
    categoria: "ENTREGA",
    conteudo:
      "Não é necessário nenhum depósito ou caução. Após o cadastro aprovado, o primeiro mostruário chega em 1 a 3 dias, e inclui brincos, anéis, correntes, pulseiras e pingentes, em acabamentos banhados a ouro 18k, aço inoxidável banhado a ouro, e banhados a prata. A retirada pode ser feita pessoalmente ou por entrega via motoboy — nessa primeira entrega, o custo é por conta da Tania Joias.",
    tags: ["primeiro mostruario", "entrega"],
    palavrasChave: ["primeiro mostruario", "deposito", "caucao", "quanto tempo demora", "como recebo", "entrega", "motoboy"],
    prioridade: 7,
    visibility: "public",
    versao: 1,
    ativo: true,
    criadoEm: AGORA,
    atualizadoEm: AGORA,
  },
]
