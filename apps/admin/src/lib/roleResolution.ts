// IMPLEMENTATION-EMBAIXADORAS-E2.7-B — decide, logo após uma sessão ficar
// disponível (login novo ou sessão já existente ao abrir /login), qual das
// 3 áreas do app o usuário deve ver. Extraída como função pura (mesmo
// padrão de protectedRouteState.ts/loginRedirect.ts) pra ser testável sem
// montar React/DOM.
//
// REGRA DE OURO (pedida explicitamente na E2.7-B): equipe é checado
// PRIMEIRO e, se verdadeiro, decide sozinho — `fetchMinhaEmbaixadora` nunca
// é sequer chamada pra essa conta. Uma conta "não-equipe" só vira
// "embaixadora" mediante confirmação POSITIVA de `fetchMinhaEmbaixadora`
// (nunca por fallback/ausência de papel). Nenhuma combinação de entrada
// produz "embaixadora" sem essa chamada ter retornado uma linha `ativa` de
// verdade.
import { resolveLoginRedirectTarget, type LoginRedirectFrom } from "./loginRedirect"

export type LoginRole = "equipe" | "embaixadora" | "none"

export interface ResolveRoleDependencies {
  /** RPC is_equipe() (ou equivalente injetado em teste) — autoridade real de "é equipe". */
  checkIsEquipe: () => Promise<boolean>
  /** get-my-embaixadora (ou equivalente injetado em teste) — `null` = sem Embaixadora ativa vinculada a esta conta. */
  fetchMinhaEmbaixadora: () => Promise<{ status: string } | null>
}

/**
 * Nunca engole erro silenciosamente: se `checkIsEquipe`/`fetchMinhaEmbaixadora`
 * rejeitar, a rejeição propaga pro chamador (LoginPage.tsx) — que deve
 * tratar como falha de verificação, nunca como "none" silencioso (fail
 * closed com mensagem explícita, não uma decisão implícita de acesso).
 */
export async function resolveRoleAfterLogin(deps: ResolveRoleDependencies): Promise<LoginRole> {
  const isEquipe = await deps.checkIsEquipe()
  if (isEquipe) return "equipe"

  const minhaEmbaixadora = await deps.fetchMinhaEmbaixadora()
  if (minhaEmbaixadora && minhaEmbaixadora.status === "ativa") return "embaixadora"

  return "none"
}

/**
 * Traduz o papel resolvido pra um destino de navegação. `null` = não deve
 * navegar (papel "none" — o chamador faz signOut + mostra erro, nunca
 * chega a montar nenhuma rota protegida).
 */
export function resolveLoginNavigationTarget(role: LoginRole, from: LoginRedirectFrom | null | undefined): string | null {
  if (role === "equipe") return resolveLoginRedirectTarget(from)
  if (role === "embaixadora") return "/portal-embaixadora"
  return null
}
