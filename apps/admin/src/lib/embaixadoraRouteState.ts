// IMPLEMENTATION-EMBAIXADORAS-E2.7-B — estado puro do EmbaixadoraProtectedRoute,
// extraído pra ser testável sem montar React (mesmo padrão de
// protectedRouteState.ts, que continua intocado e serve só o ProtectedRoute
// de equipe). EmbaixadoraProtectedRoute.tsx só reage ao resultado desta
// função — nenhuma decisão de "quem pode ver o Portal" deve ser tomada
// inline no componente.
//
// Deliberadamente um tipo/módulo SEPARADO de protectedRouteState.ts (não
// reaproveitado): a E2.7-B pediu explicitamente "não transforme o Admin
// inteiro em um guard genérico de múltiplos papéis" — os dois guards
// (equipe e Embaixadora) ficam isolados, cada um auditável sozinho, mesmo
// que a forma seja parecida.
//
// REGRA DE OURO: fail-closed, mesmo espírito de protectedRouteState.ts.
// Qualquer combinação de entrada não coberta explicitamente pelas regras
// abaixo cai no branch `default`, que nunca retorna "authorized".

export type EmbaixadoraRouteState =
  | "session-loading"
  | "unauthenticated"
  | "lookup-loading"
  | "lookup-error"
  | "forbidden"
  | "authorized"

export interface EmbaixadoraRouteStateInput {
  /** `AuthContext.loading` — true enquanto `getSession()` inicial não resolveu. */
  sessionLoading: boolean
  /** `AuthContext.session` — null = sem sessão Supabase Auth ativa. */
  hasSession: boolean
  /** `useMyEmbaixadora().isLoading` — true enquanto a consulta está em voo (sem dado em cache ainda). */
  lookupLoading: boolean
  /** `useMyEmbaixadora().error` — truthy se a consulta falhou de verdade (rede, erro do servidor — nunca o 404 "sem Embaixadora", que já vira `null`, não erro). */
  lookupError: unknown
  /**
   * `useMyEmbaixadora().data` — `null` = conta autenticada sem Embaixadora
   * `ativa` vinculada (inclui contas de equipe — nunca tratado como erro).
   * `undefined` = ainda não resolvido. Objeto com `status` = encontrada.
   */
  minhaEmbaixadora: { status: string } | null | undefined
}

/**
 * Resolve o estado do EmbaixadoraProtectedRoute a partir do estado bruto de
 * sessão + consulta. Precedência determinística, nesta ordem — mesma forma
 * de protectedRouteState.ts:
 *
 * 1. sessão ainda carregando                                -> session-loading
 * 2. sem sessão                                              -> unauthenticated
 * 3. erro na consulta (autoritativo mesmo com dado "sobrando") -> lookup-error
 * 4. consulta ainda carregando (sem erro)                    -> lookup-loading
 * 5. minhaEmbaixadora === null                                -> forbidden
 * 6. minhaEmbaixadora com status !== 'ativa'                  -> forbidden
 *    (defesa em profundidade: o backend já só devolve 'ativa',
 *    mas esta função nunca assume isso silenciosamente)
 * 7. minhaEmbaixadora com status === 'ativa'                  -> authorized
 * 8. qualquer outra combinação (ex.: minhaEmbaixadora === undefined
 *    sem loading e sem erro — não deveria acontecer com o hook
 *    real, mas a função não assume isso)                      -> lookup-loading
 *    (fail-closed: nunca Outlet, espera um dado definitivo)
 */
export function resolveEmbaixadoraRouteState(input: EmbaixadoraRouteStateInput): EmbaixadoraRouteState {
  if (input.sessionLoading) return "session-loading"
  if (!input.hasSession) return "unauthenticated"
  if (input.lookupError) return "lookup-error"
  if (input.lookupLoading) return "lookup-loading"
  if (input.minhaEmbaixadora === null) return "forbidden"
  if (input.minhaEmbaixadora && input.minhaEmbaixadora.status === "ativa") return "authorized"
  if (input.minhaEmbaixadora) return "forbidden"
  return "lookup-loading"
}
