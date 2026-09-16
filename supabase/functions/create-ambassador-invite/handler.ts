// handler.ts (E2.2-C1) — request handling de `create-ambassador-invite`.
// Extraído pra permitir teste direto (mesmo padrão já usado em
// `get-ficha/handler.ts`/`knowledge-service/handler.ts`), sem precisar
// subir `Deno.serve` nem um cliente Supabase real. `index.ts` continua
// sendo o único ponto de I/O (Supabase Auth, banco) — todas as
// dependências externas chegam injetadas via `CreateAmbassadorInviteDependencies`.
//
// PRIVACIDADE — REGRA ABSOLUTA (ver auditoria E2.2-A/C1): o token bruto do
// convite nunca é passado para `insertEmbaixadora` (só o hash vai pro
// banco) nem para `logEvent` — ele só existe nesta função e só aparece
// uma única vez, no campo `invite_url` da resposta de sucesso.
//
// Esta é a PRIMEIRA Edge Function do projeto que valida identidade via JWT
// (nenhuma outra function existente faz isso — todas rodam service-role
// "às cegas", confiando em CORS/contrato fechado). A autorização real
// (JWT válido + public.is_equipe()) é responsabilidade de `authorize`,
// injetada por `index.ts` — este arquivo nunca decide sozinho quem é
// equipe, só reage ao resultado.

import {
  CODIGO_REFERRAL_MAX_ATTEMPTS,
  classifyDuplicateConflict,
  classifyUniqueViolation,
  generateCodigoReferral,
  generateInviteTokenBytes,
  normalizeAndValidateEmail,
  normalizeBrazilianPhone,
  normalizeInstagram,
  sha256Hex,
  toBase64Url,
  validateNome,
  type EmbaixadoraStatus,
} from "./logic.ts"

export type AuthorizeResult = { authorized: true; uid: string } | { authorized: false; status: 401 | 403 }

export interface InsertedEmbaixadora {
  id: string
  nome: string
  status: EmbaixadoraStatus
  codigoReferral: string
}

export interface InsertEmbaixadoraRow {
  nome: string
  telefone_normalizado: string
  email: string
  instagram: string | null
  codigo_referral: string
  invite_token_hash: string
}

/** Formato mínimo que um erro de violação de UNIQUE precisa ter — não acopla a nenhuma lib de banco específica. */
export interface UniqueViolationLike {
  code: "23505"
  constraint?: string | null
}

export interface CreateAmbassadorInviteDependencies {
  allowedOrigins: readonly string[]
  /** Base do link de convite, ex.: "https://taniajoiasmaua.com.br/embaixadoras/convite" — o token bruto é anexado como "/<token>". */
  inviteBaseUrl: string
  /** Nunca `Math.random` — em produção é `crypto.getRandomValues`. */
  randomBytes: (n: number) => Uint8Array
  /** Valida o JWT do header Authorization e checa public.is_equipe() server-side. Nunca confia em papel/email/user_id vindos do body. */
  authorize: (authorizationHeader: string | null) => Promise<AuthorizeResult>
  findExistingEmbaixadora: (params: {
    telefoneNormalizado: string
    emailNormalizado: string
  }) => Promise<{ status: EmbaixadoraStatus } | null>
  /** Deve rejeitar (throw) um objeto com `code: "23505"` em violação de UNIQUE — nunca engolir o erro. */
  insertEmbaixadora: (row: InsertEmbaixadoraRow) => Promise<InsertedEmbaixadora>
  /** Nunca deve receber token bruto, invite_url, e-mail ou telefone — só metadados minimizados. */
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

function isUniqueViolation(err: unknown): err is UniqueViolationLike {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "23505"
}

interface ParsedPayload {
  nome?: unknown
  telefone?: unknown
  email?: unknown
  instagram?: unknown
}

export function createCreateAmbassadorInviteHandler(dependencies: CreateAmbassadorInviteDependencies) {
  return async (req: Request): Promise<Response> => {
    const headers = cors(req.headers.get("origin"), dependencies.allowedOrigins)
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers })
    if (!headers["Access-Control-Allow-Origin"]) return json({ error: "origin_not_allowed" }, 403, headers)
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, headers)

    // Autorização ANTES de qualquer parsing/validação de payload — nunca
    // gasta trabalho (nem loga nada) numa requisição que nem é de equipe.
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

    // Só estes 4 campos são lidos do body — nome/telefone/email/instagram.
    // Qualquer outro campo (status, codigo_referral, invite_token_hash,
    // user_id, papel, pix, cpf, ...) nunca é referenciado em lugar nenhum
    // abaixo, então não pode influenciar nada, mesmo que venha no JSON.
    const nomeResult = validateNome(body?.nome)
    if (!nomeResult.valid) return json({ error: nomeResult.reason }, 400, headers)

    const telefoneRaw = typeof body?.telefone === "string" ? body.telefone : null
    const telefoneResult = normalizeBrazilianPhone(telefoneRaw)
    if (!telefoneResult.valid) return json({ error: "telefone_invalido" }, 400, headers)

    const emailResult = normalizeAndValidateEmail(body?.email)
    if (!emailResult.valid) return json({ error: emailResult.reason }, 400, headers)

    const instagramResult = normalizeInstagram(body?.instagram)
    if (!instagramResult.valid) return json({ error: instagramResult.reason }, 400, headers)

    const telefoneNormalizado = telefoneResult.e164
    const email = emailResult.value

    // findExistingEmbaixadora agora pode rejeitar (erro de query, nunca mais
    // engolido em index.ts — ver auditoria E2.2-C1.1). Sem este try/catch, a
    // rejeição vazaria como uma promise rejeitada não tratada até o
    // Deno.serve, pulando os headers de CORS e o logEvent minimizado.
    let existing: Awaited<ReturnType<typeof dependencies.findExistingEmbaixadora>>
    try {
      existing = await dependencies.findExistingEmbaixadora({
        telefoneNormalizado,
        emailNormalizado: email,
      })
    } catch {
      dependencies.logEvent({ event: "invite_error", actorUid: auth.uid, reason: "duplicate_check_failed" })
      return json({ error: "internal_error" }, 500, headers)
    }
    if (existing) {
      const conflict = classifyDuplicateConflict(existing.status)
      dependencies.logEvent({ event: "invite_conflict", actorUid: auth.uid, reason: conflict.code })
      return json({ error: conflict.code, message: conflict.message }, 409, headers)
    }

    // Token bruto: nasce e morre aqui dentro. Nunca passa por
    // insertEmbaixadora (só o hash) nem por logEvent.
    const tokenBytes = generateInviteTokenBytes(dependencies.randomBytes)
    const tokenBruto = toBase64Url(tokenBytes)
    const inviteTokenHash = await sha256Hex(tokenBruto)

    let codigoReferral = generateCodigoReferral(dependencies.randomBytes)
    let inserted: InsertedEmbaixadora | null = null
    let attempts = 0

    while (!inserted) {
      attempts += 1
      try {
        inserted = await dependencies.insertEmbaixadora({
          nome: nomeResult.value,
          telefone_normalizado: telefoneNormalizado,
          email,
          instagram: instagramResult.value,
          codigo_referral: codigoReferral,
          invite_token_hash: inviteTokenHash,
        })
      } catch (err) {
        if (!isUniqueViolation(err)) {
          dependencies.logEvent({ event: "invite_error", actorUid: auth.uid, reason: "insert_failed" })
          return json({ error: "internal_error" }, 500, headers)
        }

        const target = classifyUniqueViolation(err.constraint ?? null)

        if (target === "codigo_referral" && attempts < CODIGO_REFERRAL_MAX_ATTEMPTS) {
          codigoReferral = generateCodigoReferral(dependencies.randomBytes)
          continue
        }
        if (target === "codigo_referral") {
          dependencies.logEvent({ event: "invite_error", actorUid: auth.uid, reason: "codigo_referral_exhausted" })
          return json({ error: "internal_error" }, 500, headers)
        }
        if (target === "telefone" || target === "email") {
          // Corrida: alguém inseriu entre o findExistingEmbaixadora e
          // agora. Mesmo tratamento amigável do caso não-corrida.
          dependencies.logEvent({ event: "invite_conflict_race", actorUid: auth.uid, reason: target })
          return json(
            { error: target === "telefone" ? "telefone_ja_existe" : "email_ja_existe" },
            409,
            headers,
          )
        }
        // invite_token_hash (colisão criptograficamente extraordinária) ou
        // alvo desconhecido: nunca retry, sempre erro sanitizado.
        dependencies.logEvent({
          event: "invite_error",
          actorUid: auth.uid,
          reason: "unique_violation_unexpected",
          target,
        })
        return json({ error: "internal_error" }, 500, headers)
      }
    }

    // `.replace(/\/+$/, "")` normaliza uma ou mais barras finais em
    // inviteBaseUrl (ex.: config real ".../convite/" por engano) — sem isso,
    // a URL final viraria ".../convite//TOKEN" (achado na auditoria
    // E2.2-C1.1). O token sempre fica como segmento de path, nunca em query
    // string.
    const inviteUrl = `${dependencies.inviteBaseUrl.replace(/\/+$/, "")}/${tokenBruto}`

    dependencies.logEvent({
      event: "invite_created",
      actorUid: auth.uid,
      embaixadoraId: inserted.id,
      success: true,
    })

    return json(
      {
        embaixadora: {
          id: inserted.id,
          nome: inserted.nome,
          status: inserted.status,
          codigo_referral: inserted.codigoReferral,
        },
        invite_url: inviteUrl,
      },
      201,
      headers,
    )
  }
}
