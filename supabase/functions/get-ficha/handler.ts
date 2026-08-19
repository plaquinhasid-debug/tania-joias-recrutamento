// handler.ts (IMPLEMENTATION-LGPD-001A)
//
// Extraído de `index.ts` pra permitir teste direto (mesmo padrão já usado em
// `knowledge-service/handler.ts`), sem precisar subir um servidor `Deno.serve`
// nem um cliente Supabase real. `index.ts` continua sendo o único ponto de
// I/O (Supabase) — nenhum comportamento externo muda com esta extração.
//
// A Ficha pode conter endereço, dados familiares e referências pessoais —
// por isso `Access-Control-Allow-Origin` deixou de ser "*" (qualquer site)
// e passou a exigir uma origem explicitamente permitida, mesmo mecanismo já
// usado em `knowledge-service`/`agent-ai-gateway`. Token, URL, autenticação
// e schema continuam exatamente os mesmos — só o CORS mudou.

export interface FichaLookupResult {
  preenchidoEm: string | null
  primeiroNome: string
}

export interface GetFichaDependencies {
  allowedOrigins: readonly string[]
  /** Devolve `null` se o token não existir (nunca lança por token inválido — isso é resultado normal, não erro). */
  lookupFicha: (token: string) => Promise<FichaLookupResult | null>
}

function cors(origin: string | null, allowedOrigins: readonly string[]): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  }
  if (origin && allowedOrigins.includes(origin)) headers["Access-Control-Allow-Origin"] = origin
  return headers
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } })
}

export function createGetFichaHandler(dependencies: GetFichaDependencies) {
  return async (req: Request): Promise<Response> => {
    const headers = cors(req.headers.get("origin"), dependencies.allowedOrigins)
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers })
    if (!headers["Access-Control-Allow-Origin"]) return json({ error: "origin_not_allowed" }, 403, headers)
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, headers)

    let body: { token?: string }
    try {
      body = await req.json()
    } catch {
      return json({ error: "invalid_json" }, 400, headers)
    }

    if (!body?.token) return json({ error: "missing_token" }, 400, headers)

    const ficha = await dependencies.lookupFicha(body.token)
    if (!ficha) return json({ status: "invalido" }, 200, headers)
    if (ficha.preenchidoEm) return json({ status: "preenchida" }, 200, headers)
    return json({ status: "pendente", nome: ficha.primeiroNome }, 200, headers)
  }
}
