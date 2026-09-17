// handler.ts (E2.6-A) — request handling de `resend-ambassador-invite`.
// Mesmo padrão de create-ambassador-invite/handler.ts: extraído pra teste
// direto, sem precisar subir `Deno.serve` nem um cliente Supabase real.
// `index.ts` continua sendo o único ponto de I/O real (RPC Postgres via
// service role) — todas as dependências externas chegam injetadas.
//
// PRIVACIDADE — mesma regra absoluta de create-ambassador-invite/handler.ts:
// o token bruto do novo convite nunca é passado para `resendInvite` (só o
// hash vai pro banco, via a RPC) nem para `logEvent` — só existe nesta
// função e só aparece uma única vez, no campo `invite_url` da resposta de
// sucesso.
//
// AUTORIZAÇÃO — mesmo contrato de create-ambassador-invite/handler.ts
// (equipe via JWT + public.is_equipe(), responsabilidade de `authorize`
// injetada por index.ts). Esta function NUNCA cria uma Embaixadora nova —
// só reemite o convite de uma linha já existente, então não há payload de
// nome/telefone/email/instagram pra validar aqui, só o identificador da
// linha e a prova de estado (`expected_updated_at`).

import {
  computeNewExpiraEm,
  generateInviteTokenBytes,
  isPlausibleEmbaixadoraId,
  isPlausibleUpdatedAt,
  sha256Hex,
  toBase64Url,
  type ResendFailureReason,
} from "./logic.ts"

export type AuthorizeResult = { authorized: true; uid: string } | { authorized: false; status: 401 | 403 }

export type ResendResult =
  | { ok: true; embaixadoraId: string; inviteExpiraEm: string }
  | { ok: false; reason: ResendFailureReason }

export interface ResendAmbassadorInviteDependencies {
  allowedOrigins: readonly string[]
  /** Base do link de convite — mesmo valor/normalização de create-ambassador-invite. */
  inviteBaseUrl: string
  /** Nunca `Math.random` — em produção é `crypto.getRandomValues`. */
  randomBytes: (n: number) => Uint8Array
  /** Nunca `Date.now` direto — injetado pra determinismo em teste; em produção é `() => Date.now()`. */
  now: () => number
  /** Valida o JWT do header Authorization e checa public.is_equipe() server-side. Nunca confia em papel/uid vindos do body. */
  authorize: (authorizationHeader: string | null) => Promise<AuthorizeResult>
  /** RPC resend_ambassador_invite. Único ponto que decide, de forma atômica, se o reenvio aconteceu. */
  resendInvite: (params: {
    embaixadoraId: string
    expectedUpdatedAt: string
    newTokenHash: string
    newExpiraEm: string
  }) => Promise<ResendResult>
  /** Nunca deve receber token bruto, invite_url, nome, e-mail ou telefone. */
  logEvent: (fields: Record<string, unknown>) => void
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

const FAILURE_STATUS: Record<ResendFailureReason, number> = {
  not_found: 404,
  nao_convidada: 409,
  resgate_em_andamento: 409,
  estado_desatualizado: 409,
}

interface ParsedPayload {
  embaixadora_id?: unknown
  expected_updated_at?: unknown
}

export function createResendAmbassadorInviteHandler(dependencies: ResendAmbassadorInviteDependencies) {
  return async (req: Request): Promise<Response> => {
    const headers = cors(req.headers.get("origin"), dependencies.allowedOrigins)
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers })
    if (!headers["Access-Control-Allow-Origin"]) return json({ error: "origin_not_allowed" }, 403, headers)
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, headers)

    // Autorização ANTES de qualquer parsing/validação de payload — mesmo
    // motivo de create-ambassador-invite/handler.ts: nunca gasta trabalho
    // (nem loga nada) numa requisição que nem é de equipe.
    const auth = await dependencies.authorize(req.headers.get("authorization"))
    if (!auth.authorized) {
      return json({ error: auth.status === 401 ? "unauthorized" : "forbidden" }, auth.status, headers)
    }

    let body: ParsedPayload
    try {
      body = await req.json()
    } catch {
      return json({ error: "invalid_json" }, 400, headers)
    }

    if (!isPlausibleEmbaixadoraId(body?.embaixadora_id)) {
      return json({ error: "embaixadora_id_invalido" }, 400, headers)
    }
    if (!isPlausibleUpdatedAt(body?.expected_updated_at)) {
      return json({ error: "expected_updated_at_invalido" }, 400, headers)
    }

    // Token bruto: nasce e morre aqui dentro. Nunca passa para
    // resendInvite (só o hash) nem por logEvent — mesma disciplina de
    // create-ambassador-invite/handler.ts.
    const tokenBytes = generateInviteTokenBytes(dependencies.randomBytes)
    const tokenBruto = toBase64Url(tokenBytes)
    const newTokenHash = await sha256Hex(tokenBruto)
    const newExpiraEm = computeNewExpiraEm(dependencies.now)

    let result: ResendResult
    try {
      result = await dependencies.resendInvite({
        embaixadoraId: body.embaixadora_id,
        expectedUpdatedAt: body.expected_updated_at,
        newTokenHash,
        newExpiraEm,
      })
    } catch {
      dependencies.logEvent({ event: "resend_error", actorUid: auth.uid, reason: "rpc_failed" })
      return json({ error: "internal_error" }, 500, headers)
    }

    if (!result.ok) {
      dependencies.logEvent({
        event: "resend_conflict",
        actorUid: auth.uid,
        reason: result.reason,
      })
      return json({ error: result.reason }, FAILURE_STATUS[result.reason], headers)
    }

    // `.replace(/\/+$/, "")` normaliza barra(s) final(is) em inviteBaseUrl —
    // mesma proteção de create-ambassador-invite/handler.ts.
    const inviteUrl = `${dependencies.inviteBaseUrl.replace(/\/+$/, "")}/${tokenBruto}`

    dependencies.logEvent({
      event: "resend_success",
      actorUid: auth.uid,
      embaixadoraId: result.embaixadoraId,
      success: true,
    })

    return json(
      {
        invite_url: inviteUrl,
        invite_expira_em: result.inviteExpiraEm,
      },
      200,
      headers,
    )
  }
}
