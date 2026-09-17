// logic.ts — lógica pura (sem I/O) de `list-ambassadors-admin`. Mesmo
// padrão de create-ambassador-invite/logic.ts: testável direto via
// node:test, nenhuma função aqui faz rede/banco. index.ts continua sendo
// o único ponto de I/O real (Supabase Auth, banco).
//
// Duplicação deliberada com create-ambassador-invite/logic.ts (ex.:
// `EmbaixadoraStatus`) — ver auditoria E2.3-A/instrução da E2.3-B: as duas
// functions administrativas de Embaixadoras não compartilham um framework
// comum de propósito, pra manter a fronteira de segurança de cada uma
// isolada e auditável sozinha.

export type EmbaixadoraStatus = "convidada" | "ativa" | "inativa" | "rejeitada"

/**
 * Formato mínimo de uma linha crua vinda de `public.embaixadoras` que esta
 * function precisa — não é o schema completo da tabela (que tem colunas
 * sensíveis como `invite_token_hash`), só os 10 campos que o Admin V1
 * precisa ler. O SELECT em index.ts já pede só essas colunas; este tipo
 * documenta o contrato mínimo esperado, não amplia o que é lido.
 * `updated_at` (E2.6-A): não sensível — usado pelo Admin como
 * `expected_updated_at` ao chamar `resend-ambassador-invite`.
 */
export interface EmbaixadoraRow {
  id: string
  nome: string
  telefone_normalizado: string
  email: string
  instagram: string | null
  codigo_referral: string
  status: EmbaixadoraStatus
  created_at: string
  aprovada_em: string | null
  updated_at: string
}

/** Formato exato devolvido ao Admin — idêntico a `EmbaixadoraRow` hoje, mas mantido como tipo próprio de propósito (ver `projectEmbaixadora`). */
export interface EmbaixadoraListItem {
  id: string
  nome: string
  telefone_normalizado: string
  email: string
  instagram: string | null
  codigo_referral: string
  status: EmbaixadoraStatus
  created_at: string
  aprovada_em: string | null
  updated_at: string
}

/**
 * DEFESA EM PROFUNDIDADE (pedida explicitamente na E2.3-B, seção 10):
 * projeção campo a campo, nunca um spread (`{...row}`) nem `return row`
 * cru. Mesmo que o SELECT em index.ts seja alterado no futuro pra incluir
 * uma coluna sensível por engano (ex.: `invite_token_hash`), essa coluna
 * extra chegaria até aqui dentro de `row` mas NUNCA sairia no objeto
 * devolvido — porque esta função só copia, um a um, os campos que ela
 * mesma lista explicitamente abaixo. Uma segunda camada de proteção,
 * independente do SELECT.
 */
export function projectEmbaixadora(row: EmbaixadoraRow): EmbaixadoraListItem {
  return {
    id: row.id,
    nome: row.nome,
    telefone_normalizado: row.telefone_normalizado,
    email: row.email,
    instagram: row.instagram,
    codigo_referral: row.codigo_referral,
    status: row.status,
    created_at: row.created_at,
    aprovada_em: row.aprovada_em,
    updated_at: row.updated_at,
  }
}

export function projectEmbaixadoras(rows: EmbaixadoraRow[]): EmbaixadoraListItem[] {
  return rows.map(projectEmbaixadora)
}
