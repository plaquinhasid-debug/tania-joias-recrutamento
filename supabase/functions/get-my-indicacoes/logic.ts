// logic.ts — lógica pura (sem I/O) de `get-my-indicacoes`. Mesmo padrão de
// get-my-embaixadora/logic.ts: testável direto via node:test, nenhuma
// função aqui faz rede/banco. index.ts continua sendo o único ponto de I/O
// real (Supabase Auth + banco).
//
// E2.9 — "Minhas indicações" no Portal da Embaixadora. SOMENTE LEITURA;
// nunca cria/altera/apaga nada, nunca toca em recompensas_embaixadoras.

// Duplicado localmente (não importado de get-my-embaixadora/logic.ts):
// cada Edge Function é empacotada/deployada como bundle isolado — um import
// relativo saindo desta pasta escaparia do bundle desta function, mesmo
// motivo já documentado em supabase/functions/_shared/phone.ts (E2.8).
export type EmbaixadoraStatus = "convidada" | "ativa" | "inativa" | "rejeitada"

/** Só `status === 'ativa'` pode acessar o Portal — mesma regra de get-my-embaixadora/logic.ts (isPortalEligible), duplicada aqui pelo mesmo motivo de empacotamento. */
export function isPortalEligibleStatus(status: EmbaixadoraStatus): boolean {
  return status === "ativa"
}

export type IndicacaoStatusRaw = "atribuida" | "invalidada"
export type LeadStatusRaw = "novo" | "em_analise" | "aprovada" | "reprovada"
export type EtapaPosAprovacaoRaw = "contatada" | "confirmada" | "aguardando_tania" | "ativa" | "desistiu" | null

/** Os 3 únicos estados públicos que a Embaixadora vê — nunca o valor cru do banco (decisão de produto E2.9, seção 3). */
export type SituacaoPublica = "em_analise" | "aprovada" | "nao_aprovada"

/**
 * Mapeamento aprovado (E2.9, seção 3): `aprovada` + `desistiu` cai em
 * "nao_aprovada" (mesmo agrupamento já usado no Kanban do Admin, ver
 * packages/shared/src/constants.ts PIPELINE_COLUMNS "desistiu"). `novo` e
 * `em_analise` caem juntos em "em_analise". Nenhuma etapa operacional
 * interna (contatada/confirmada/aguardando_tania/ativa) é exposta — todas
 * viram simplesmente "aprovada".
 */
export function mapSituacao(status: LeadStatusRaw, etapaPosAprovacao: EtapaPosAprovacaoRaw): SituacaoPublica {
  if (status === "aprovada") {
    return etapaPosAprovacao === "desistiu" ? "nao_aprovada" : "aprovada"
  }
  if (status === "reprovada") return "nao_aprovada"
  return "em_analise"
}

/**
 * Formato cru de uma linha vinda do JOIN `indicacoes_embaixadoras` ->
 * `leads` (embedded select do PostgREST). `leads` é `null` quando
 * `lead_id` é null — caso real de `ON DELETE SET NULL` se o lead for
 * apagado no futuro (decisão E2.9, seção 2: omitir, nunca quebrar).
 */
export interface IndicacaoJoinRow {
  status: IndicacaoStatusRaw
  primeira_atribuicao_em: string
  leads: { nome: string; status: LeadStatusRaw; etapa_pos_aprovacao: EtapaPosAprovacaoRaw } | null
}

/** Formato exato devolvido à Embaixadora — só os 3 campos aprovados no contrato (E2.9, seção 5). */
export interface IndicacaoItem {
  nome: string
  situacao: SituacaoPublica
  indicada_em: string
}

export interface MinhasIndicacoesResponse {
  total: number
  indicacoes: IndicacaoItem[]
}

/**
 * DEFESA EM PROFUNDIDADE (mesmo padrão de projectMinhaEmbaixadora/
 * buildIndicacaoEmbaixadoraRow): projeção campo a campo, nunca spread.
 *
 * Filtra `status !== 'atribuida'` (decisão E2.9, seção 1 — "invalidada"
 * nunca aparece) e `leads === null` (decisão E2.9, seção 2 — lead removido
 * nunca aparece) AQUI, mesmo que index.ts já filtre `status='atribuida'`
 * na query — nunca confia só no filtro do banco, mesmo espírito de
 * decideAttribution (E2.8) ser fail-closed por padrão.
 *
 * Reordena por `primeira_atribuicao_em` DESC aqui também (defesa contra um
 * `ORDER BY` que viesse a ser removido/alterado em index.ts sem querer).
 */
export function buildIndicacoesResponse(rows: readonly IndicacaoJoinRow[]): MinhasIndicacoesResponse {
  const indicacoes: IndicacaoItem[] = []
  for (const row of rows) {
    if (row.status !== "atribuida") continue
    if (!row.leads) continue
    indicacoes.push({
      nome: row.leads.nome,
      situacao: mapSituacao(row.leads.status, row.leads.etapa_pos_aprovacao),
      indicada_em: row.primeira_atribuicao_em,
    })
  }
  indicacoes.sort((a, b) => new Date(b.indicada_em).getTime() - new Date(a.indicada_em).getTime())
  return { total: indicacoes.length, indicacoes }
}
