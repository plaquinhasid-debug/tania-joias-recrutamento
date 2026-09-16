// IMPLEMENTATION-EMBAIXADORAS-E2.2-D.0-B — estado puro do ProtectedRoute,
// extraído pra ser testável sem montar React (mesmo padrão de
// loginRedirect.ts). ProtectedRoute.tsx só reage ao resultado desta função
// — nenhuma decisão de "quem pode ver o Admin" deve ser tomada inline no
// componente.
//
// REGRA DE OURO: fail-closed. Qualquer combinação de entrada não coberta
// explicitamente pelas regras abaixo cai no branch `default`, que nunca
// retorna "authorized" — ver o teste "estado indeterminado nunca libera
// Admin" em tests/protected-route-state.test.mjs.

export type ProtectedRouteState =
  | "session-loading"
  | "unauthenticated"
  | "authorization-loading"
  | "authorization-error"
  | "forbidden"
  | "authorized"

export interface ProtectedRouteStateInput {
  /** `AuthContext.loading` — true enquanto `getSession()` inicial não resolveu. */
  sessionLoading: boolean
  /** `AuthContext.session` — null = sem sessão Supabase Auth ativa. */
  hasSession: boolean
  /** `useIsEquipe().isLoading` — true enquanto a RPC `is_equipe()` está em voo (sem dado em cache ainda). */
  isEquipeLoading: boolean
  /** `useIsEquipe().error` — truthy se a RPC falhou (rede, erro do Postgres, etc). */
  isEquipeError: unknown
  /** `useIsEquipe().data` — `true`/`false` depois da RPC resolver, `undefined` antes disso. */
  isEquipe: boolean | undefined
}

/**
 * Resolve o estado do ProtectedRoute a partir do estado bruto de sessão +
 * autorização. Precedência determinística, nesta ordem:
 *
 * 1. sessão ainda carregando (getSession inicial)          -> session-loading
 * 2. sem sessão                                             -> unauthenticated
 * 3. erro na checagem de autorização (mesmo se isEquipe      -> authorization-error
 *    tiver algum valor "sobrando" de uma leitura anterior —
 *    erro é sempre autoritativo quando presente)
 * 4. autorização ainda carregando (sem erro)                -> authorization-loading
 * 5. isEquipe === false                                      -> forbidden
 * 6. isEquipe === true                                       -> authorized
 * 7. qualquer outra combinação (ex.: isEquipe === undefined
 *    sem loading e sem erro — não deveria acontecer com o
 *    hook real, mas a função não assume isso)                -> authorization-loading
 *    (fail-closed: nunca Outlet, espera um dado definitivo em vez de travar
 *    com um erro que não existe)
 */
export function resolveProtectedRouteState(input: ProtectedRouteStateInput): ProtectedRouteState {
  if (input.sessionLoading) return "session-loading"
  if (!input.hasSession) return "unauthenticated"
  if (input.isEquipeError) return "authorization-error"
  if (input.isEquipeLoading) return "authorization-loading"
  if (input.isEquipe === false) return "forbidden"
  if (input.isEquipe === true) return "authorized"
  return "authorization-loading"
}
