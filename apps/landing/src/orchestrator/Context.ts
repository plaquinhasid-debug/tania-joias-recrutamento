/**
 * Context (RFC-003).
 *
 * Representa tudo que a Sofia sabe sobre a candidata — separado do estado
 * técnico da conversa (`ConversationState.ts`). Reconstruído a cada turno a
 * partir das respostas acumuladas (`SofiaAnswers`), preservando campos que
 * ainda não têm nenhuma fonte de atualização nesta fase (`duvidasAbertas`,
 * `objecoes` — estrutura preparada, detecção ainda não implementada).
 */
import type { SofiaAnswers } from "@/types/sofia"
import type { SofiaContext } from "./types"

export function buildContext(answers: SofiaAnswers, previous?: SofiaContext): SofiaContext {
  return {
    nome: answers.nome,
    cidade: answers.cidade,
    profissao: answers.profissao,
    empresaAtual: answers.empresa_atual,
    experienciaVendas: answers.experiencia_vendas,
    possuiInstagram: answers.possui_instagram,
    instagram: answers.instagram,
    whatsapp: answers.whatsapp,
    motivacao: answers.objetivo,
    tempoDisponivel: answers.tempo_disponivel,
    duvidasAbertas: previous?.duvidasAbertas ?? [],
    objecoes: previous?.objecoes ?? [],
  }
}
