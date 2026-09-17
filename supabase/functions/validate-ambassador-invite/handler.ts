// handler.ts (E2.5-B) — request handling de `validate-ambassador-invite`.
// Extraído pra permitir teste direto sem Deno.serve nem cliente Supabase
// real, mesmo padrão de create-ambassador-invite/handler.ts e
// get-ficha/handler.ts. `index.ts` continua sendo o único ponto de I/O.
//
// RESPONSABILIDADE: só VALIDA. Nunca adquire claim, nunca cria Auth user,
// nunca atualiza embaixadoras, nunca consome o convite — isso é
// redeem-ambassador-invite. Chamar validate() quantas vezes quiser nunca
// tem efeito colateral.
//
// MINIMIZAÇÃO — mesmo espírito de get-ficha/handler.ts: nunca diferencia
// publicamente POR QUE um convite é inválido (inexistente/expirado/
// usado/status errado) — sempre a mesma resposta {status:"invalido"}, pra
// nunca virar um oráculo de enumeração de convites/e-mails.
import { isInviteRedeemable, isPlausibleToken, sha256Hex, type InviteLookup } from "./logic.ts"

export interface ValidateAmbassadorInviteDependencies {
  allowedOrigins: readonly string[]
  /** Injetado pra determinismo em teste — em produção é `() => Date.now()`. */
  now: () => number
  /** Devolve `null` se o hash não existir (nunca lança por token inexistente — isso é resultado normal, não erro). */
  findByTokenHash: (tokenHash: string) => Promise<InviteLookup | null>
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

interface ParsedPayload {
  token?: unknown
}

export function createValidateAmbassadorInviteHandler(dependencies: ValidateAmbassadorInviteDependencies) {
  return async (req: Request): Promise<Response> => {
    const headers = cors(req.headers.get("origin"), dependencies.allowedOrigins)
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers })
    if (!headers["Access-Control-Allow-Origin"]) return json({ error: "origin_not_allowed" }, 403, headers)
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, headers)

    let body: ParsedPayload
    try {
      body = await req.json()
    } catch {
      return json({ error: "invalid_json" }, 400, headers)
    }

    // Formato implausível: mesma resposta minimizada de "inválido" real,
    // nunca um shape de erro diferente — evita que o formato da resposta
    // por si só vaze se o token "chegou perto" de ser válido.
    if (!isPlausibleToken(body?.token)) return json({ status: "invalido" }, 200, headers)

    const tokenHash = await sha256Hex(body.token)

    // Sem este try/catch, uma rejeição de findByTokenHash (erro de rede/DB)
    // vazaria como promise rejeitada não tratada até o Deno.serve, pulando
    // os headers de CORS já construídos acima — mesmo achado/mesma correção
    // de create-ambassador-invite/handler.ts (auditoria E2.2-C1.1), agora
    // replicado aqui (achado ALTO da auditoria E2.5-C).
    let lookup: InviteLookup | null
    try {
      lookup = await dependencies.findByTokenHash(tokenHash)
    } catch {
      return json({ error: "internal_error" }, 500, headers)
    }

    if (!lookup || !isInviteRedeemable(lookup, dependencies.now())) {
      return json({ status: "invalido" }, 200, headers)
    }

    return json({ status: "valido", nome: lookup.nome, email: lookup.email }, 200, headers)
  }
}
