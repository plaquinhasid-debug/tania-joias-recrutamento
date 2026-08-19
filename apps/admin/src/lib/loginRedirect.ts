// IMPLEMENTATION-CRM-004B (item 4) — bug real encontrado no diagnóstico
// CRM-004A: o redirect pós-login só usava `location.state.from.pathname`,
// descartando `.search` — então um deep link `/crm?lead=abc123` acessado
// sem sessão ativa perdia o `?lead=` depois do login, caindo em `/crm` puro.
// Extraída como função pura (em vez de inline em LoginPage.tsx) só pra ser
// testável sem montar react-router/DOM.
export interface LoginRedirectFrom {
  pathname?: string | null
  search?: string | null
}

/** `from` ausente/incompleto -> "/" (comportamento anterior, preservado). */
export function resolveLoginRedirectTarget(from: LoginRedirectFrom | null | undefined): string {
  if (!from?.pathname) return "/"
  return `${from.pathname}${from.search ?? ""}`
}
