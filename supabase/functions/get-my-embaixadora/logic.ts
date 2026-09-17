// logic.ts — lógica pura (sem I/O) de `get-my-embaixadora`. Mesmo padrão de
// list-ambassadors-admin/logic.ts: testável direto via node:test, nenhuma
// função aqui faz rede/banco. index.ts continua sendo o único ponto de I/O
// real (Supabase Auth + banco).
//
// PORTAL MÍNIMO (E2.7-B) — esta function nunca cria/altera nada; é
// somente-leitura, e devolve só os 3 campos que o Portal Mínimo precisa.
// Indicações/recompensas/saldo ficam fora de escopo desta etapa.

export type EmbaixadoraStatus = "convidada" | "ativa" | "inativa" | "rejeitada"

/**
 * Formato mínimo de uma linha crua vinda de `public.embaixadoras` que esta
 * function precisa — não é o schema completo da tabela (que tem colunas
 * sensíveis como `invite_token_hash`, `telefone_normalizado`, `email`), só
 * os 3 campos que o Portal Mínimo mostra. O SELECT em index.ts já pede só
 * essas colunas; este tipo documenta o contrato mínimo esperado, não amplia
 * o que é lido.
 */
export interface MinhaEmbaixadoraRow {
  nome: string
  status: EmbaixadoraStatus
  codigo_referral: string
}

/** Formato exato devolvido à Embaixadora — idêntico a `MinhaEmbaixadoraRow` hoje, mas mantido como tipo próprio de propósito (ver `projectMinhaEmbaixadora`, mesmo espírito de list-ambassadors-admin). */
export interface MinhaEmbaixadoraItem {
  nome: string
  status: EmbaixadoraStatus
  codigo_referral: string
}

/**
 * DEFESA EM PROFUNDIDADE (mesmo padrão de list-ambassadors-admin/logic.ts):
 * projeção campo a campo, nunca um spread (`{...row}`) nem `return row` cru.
 * Mesmo que o SELECT em index.ts seja alterado no futuro pra incluir uma
 * coluna sensível por engano (ex.: `invite_token_hash`, `user_id`,
 * `telefone_normalizado`, `email`), essa coluna extra chegaria até aqui
 * dentro de `row` mas NUNCA sairia no objeto devolvido.
 */
export function projectMinhaEmbaixadora(row: MinhaEmbaixadoraRow): MinhaEmbaixadoraItem {
  return {
    nome: row.nome,
    status: row.status,
    codigo_referral: row.codigo_referral,
  }
}

/**
 * Só `status === 'ativa'` pode acessar o Portal. `convidada` (ainda não
 * resgatou), `inativa`/`rejeitada` (desativada) nunca veem nada — o
 * handler devolve o mesmo 404 genérico pra "não existe" e "existe mas não
 * é elegível", nunca diferenciando publicamente (mesmo espírito de
 * validate-ambassador-invite: nunca dar pista sobre o motivo real).
 */
export function isPortalEligible(status: EmbaixadoraStatus): boolean {
  return status === "ativa"
}
