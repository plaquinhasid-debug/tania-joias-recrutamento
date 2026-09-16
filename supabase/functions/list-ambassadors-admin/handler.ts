// handler.ts (E2.3-B) — request handling de `list-ambassadors-admin`.
// Mesmo padrão de create-ambassador-invite/handler.ts: extraído pra teste
// direto, sem precisar subir `Deno.serve` nem um cliente Supabase real.
// `index.ts` continua sendo o único ponto de I/O — todas as dependências
// externas chegam injetadas via `ListAmbassadorsAdminDependencies`.
//
// AUTORIZAÇÃO — mesmo contrato de create-ambassador-invite/handler.ts
// (duplicado de propósito, não compartilhado — ver logic.ts): `authorize`
// é responsabilidade de `index.ts` (JWT real + public.is_equipe() via
// RPC), este arquivo nunca decide sozinho quem é equipe, só reage ao
// resultado.
//
// SOMENTE LEITURA — esta function nunca escreve em `public.embaixadoras`
// nem em nenhuma outra tabela.

import { projectEmbaixadoras, type EmbaixadoraListItem, type EmbaixadoraRow } from "./logic.ts"

export type AuthorizeResult = { authorized: true; uid: string } | { authorized: false; status: 401 | 403 }

export interface ListAmbassadorsAdminDependencies {
  allowedOrigins: readonly string[]
  /** Valida o JWT do header Authorization e checa public.is_equipe() server-side. Nunca confia em nada vindo do body/query. */
  authorize: (authorizationHeader: string | null) => Promise<AuthorizeResult>
  /** Deve rejeitar (throw) em qualquer falha de query — nunca devolver uma lista vazia/parcial silenciosamente em caso de erro. */
  listEmbaixadoras: () => Promise<EmbaixadoraRow[]>
  /** Nunca deve receber nome/telefone/email/instagram/lista completa — só metadados minimizados (ex.: contagem). */
  logEvent: (fields: Record<string, unknown>) => void
}

function cors(origin: string | null, allowedOrigins: readonly string[]): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    Vary: "Origin",
  }
  if (origin && allowedOrigins.includes(origin)) headers["Access-Control-Allow-Origin"] = origin
  return headers
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } })
}

export interface ListAmbassadorsAdminSuccessBody {
  embaixadoras: EmbaixadoraListItem[]
}

export function createListAmbassadorsAdminHandler(dependencies: ListAmbassadorsAdminDependencies) {
  return async (req: Request): Promise<Response> => {
    const headers = cors(req.headers.get("origin"), dependencies.allowedOrigins)
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers })
    if (!headers["Access-Control-Allow-Origin"]) return json({ error: "origin_not_allowed" }, 403, headers)
    if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405, headers)

    // Autorização ANTES de qualquer acesso ao banco — nunca gasta trabalho
    // (nem loga nada) numa requisição que nem é de equipe.
    const auth = await dependencies.authorize(req.headers.get("authorization"))
    if (!auth.authorized) {
      return json({ error: auth.status === 401 ? "unauthorized" : "forbidden" }, auth.status, headers)
    }

    let rows: EmbaixadoraRow[]
    try {
      rows = await dependencies.listEmbaixadoras()
    } catch {
      dependencies.logEvent({ event: "list_ambassadors_error", actorUid: auth.uid, reason: "query_failed" })
      return json({ error: "internal_error" }, 500, headers)
    }

    const embaixadoras = projectEmbaixadoras(rows)

    dependencies.logEvent({
      event: "list_ambassadors",
      actorUid: auth.uid,
      count: embaixadoras.length,
    })

    const body: ListAmbassadorsAdminSuccessBody = { embaixadoras }
    return json(body, 200, headers)
  }
}
