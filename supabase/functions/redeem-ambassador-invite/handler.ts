// handler.ts (E2.5-B) — request handling de `redeem-ambassador-invite`.
// Extraído pra permitir teste direto, mesmo padrão de
// create-ambassador-invite/handler.ts. `index.ts` continua sendo o único
// ponto de I/O real (RPCs Postgres via service role + Supabase Auth Admin
// API) — todas as dependências externas chegam injetadas.
//
// DESENHO DE SAGA (CLAIM -> TRABALHO EXTERNO -> FINALIZA | LIBERA), exigido
// pela auditoria E2.5-A/migration 20260915190000 PARTE 2:
//   1. CLAIM atômico (RPC claim_ambassador_invite) — nunca um
//      SELECT-depois-UPDATE desprotegido.
//   2. TRABALHO EXTERNO fora de qualquer transação SQL: auth.admin.
//      createUser (chamada de rede ao GoTrue).
//   3a. Sucesso -> FINALIZA (RPC finalize_ambassador_invite), condicionado
//       ao claim_id exato desta tentativa.
//   3b. Falha no createUser -> LIBERA (RPC release_ambassador_invite_claim)
//       imediatamente, nunca marca token usado, nunca ativa a Embaixadora.
//   3c. createUser teve sucesso mas FINALIZA devolveu false (claim ficou
//       stale, substituído por outra tentativa) -> tenta reverter o Auth
//       user recém-criado (deleteUser) antes de liberar o claim — nunca
//       deixa um usuário órfão sem tentar.
//
// NUNCA: vincular um auth.users PREEXISTENTE só porque o e-mail bate (ver
// auditoria E2.5-A seção G/E2.5-B seção G do pedido) — sem uma prova
// inequívoca de que o usuário foi criado NESTA MESMA execução (o que aqui
// só é verdade pra um `userId` que acabou de sair do createUser desta
// própria chamada), a resposta pública é sempre o erro genérico, o claim é
// liberado, e um log minimizado registra o conflito pra tratamento manual.
import {
  DEFAULT_CLAIM_TTL_SECONDS,
  isPlausiblePassword,
  isPlausibleToken,
  sha256Hex,
} from "./logic.ts"

export interface ClaimResult {
  embaixadoraId: string
  claimId: string
  nome: string
  email: string
}

export type CreateAuthUserResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "email_exists" | "unknown" }

export interface RedeemAmbassadorInviteDependencies {
  allowedOrigins: readonly string[]
  minPasswordLength: number
  claimTtlSeconds: number
  /** RPC claim_ambassador_invite. `null` = token inexistente/usado/expirado/status errado/já reservado por outra tentativa ativa — nunca diferenciado pra fora. */
  claimInvite: (params: { tokenHash: string; ttlSeconds: number }) => Promise<ClaimResult | null>
  /** auth.admin.createUser — nunca chamado com metadata além de `{ nome }`, nunca `papel`/token/claim. */
  createAuthUser: (params: { email: string; password: string; nome: string }) => Promise<CreateAuthUserResult>
  /** RPC finalize_ambassador_invite. `false` = claim não é mais o desta tentativa (stale/substituído) — nunca lança por isso. */
  finalizeInvite: (params: { embaixadoraId: string; claimId: string; userId: string }) => Promise<boolean>
  /** RPC release_ambassador_invite_claim. Best-effort: no-op seguro se o claim já não for mais desta tentativa. */
  releaseClaim: (params: { embaixadoraId: string; claimId: string }) => Promise<void>
  /** auth.admin.deleteUser — só chamado com um userId que ACABOU de sair de createAuthUser nesta mesma execução, nunca com um id de outra origem. */
  deleteAuthUser: (userId: string) => Promise<boolean>
  /** Log estruturado minimizado — nunca token bruto, senha, invite_url, nem e-mail completo. */
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

// Único shape de erro "operacional recuperável" devolvido ao público —
// nunca error.message cru do Supabase/Postgres/GoTrue (ver auditoria E2.5-A
// seção I / pedido seção I: "não usar raw error.message como resposta
// pública").
const GENERIC_ERROR_BODY = { error: "nao_foi_possivel_criar_acesso" } as const

interface ParsedPayload {
  token?: unknown
  password?: unknown
}

async function safeRelease(
  dependencies: RedeemAmbassadorInviteDependencies,
  claim: ClaimResult,
  logReason: string,
): Promise<void> {
  try {
    await dependencies.releaseClaim({ embaixadoraId: claim.embaixadoraId, claimId: claim.claimId })
  } catch {
    dependencies.logEvent({ event: "redeem_error", reason: "release_failed", embaixadoraId: claim.embaixadoraId, cause: logReason })
  }
}

export function createRedeemAmbassadorInviteHandler(dependencies: RedeemAmbassadorInviteDependencies) {
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

    // Só token+senha são lidos do body. Nome e e-mail NUNCA vêm daqui —
    // sempre do registro associado ao token (claim.nome/claim.email),
    // nunca "fonte de verdade" do browser (pedido, seção B).
    if (!isPlausibleToken(body?.token)) return json({ status: "invalido" }, 200, headers)
    if (!isPlausiblePassword(body?.password, dependencies.minPasswordLength)) {
      return json({ error: "senha_invalida" }, 400, headers)
    }

    const tokenHash = await sha256Hex(body.token)

    let claim: ClaimResult | null
    try {
      claim = await dependencies.claimInvite({
        tokenHash,
        ttlSeconds: dependencies.claimTtlSeconds || DEFAULT_CLAIM_TTL_SECONDS,
      })
    } catch {
      dependencies.logEvent({ event: "redeem_error", reason: "claim_lookup_failed" })
      return json(GENERIC_ERROR_BODY, 500, headers)
    }
    if (!claim) return json({ status: "invalido" }, 200, headers)

    let authResult: CreateAuthUserResult
    try {
      authResult = await dependencies.createAuthUser({
        email: claim.email,
        password: body.password,
        nome: claim.nome,
      })
    } catch {
      authResult = { ok: false, reason: "unknown" }
    }

    if (!authResult.ok) {
      // Cobre tanto "email_exists" (usuário Auth preexistente — NUNCA
      // vinculado automaticamente, ver header do arquivo) quanto qualquer
      // outra falha do createUser. Em ambos os casos: libera o claim desta
      // tentativa (nunca de outra), nunca marca token usado, nunca ativa.
      await safeRelease(dependencies, claim, authResult.reason)
      dependencies.logEvent({
        event: "redeem_error",
        reason: authResult.reason === "email_exists" ? "auth_email_conflict" : "auth_create_failed",
        embaixadoraId: claim.embaixadoraId,
      })
      return json(GENERIC_ERROR_BODY, 500, headers)
    }

    let finalized: boolean
    try {
      finalized = await dependencies.finalizeInvite({
        embaixadoraId: claim.embaixadoraId,
        claimId: claim.claimId,
        userId: authResult.userId,
      })
    } catch {
      finalized = false
    }

    if (!finalized) {
      // Auth user criado com sucesso, mas a finalização em `embaixadoras`
      // não pegou (claim ficou stale). Reverte o Auth user desta MESMA
      // execução antes de liberar o claim — nunca deixa órfão sem tentar.
      const deleted = await (async () => {
        try {
          return await dependencies.deleteAuthUser(authResult.userId)
        } catch {
          return false
        }
      })()
      await safeRelease(dependencies, claim, "finalize_failed")
      dependencies.logEvent({
        event: "redeem_error",
        reason: deleted ? "finalize_failed_rolled_back" : "finalize_failed_orphan_auth_user",
        embaixadoraId: claim.embaixadoraId,
        userId: authResult.userId,
      })
      return json(GENERIC_ERROR_BODY, 500, headers)
    }

    dependencies.logEvent({ event: "redeem_success", embaixadoraId: claim.embaixadoraId })
    return json({ status: "sucesso" }, 200, headers)
  }
}
