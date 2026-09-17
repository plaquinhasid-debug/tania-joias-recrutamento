// handler.ts (E2.7-B/E2.7-C) — request handling de `get-my-embaixadora`.
// Mesmo padrão de list-ambassadors-admin/handler.ts: extraído pra teste
// direto, sem precisar subir `Deno.serve` nem um cliente Supabase real.
// `index.ts` continua sendo o único ponto de I/O — todas as dependências
// externas chegam injetadas via `GetMyEmbaixadoraDependencies`.
//
// IDENTIDADE — a diferença central pra `list-ambassadors-admin`/
// `create-ambassador-invite`: esta function é pra QUALQUER usuário
// autenticado (equipe OU Embaixadora), nunca só equipe. Por isso
// `authorize` aqui só valida o JWT e devolve o `uid` — a identidade de quem
// pergunta vem inteiramente do JWT (via `auth.getUser`), nunca de nada no
// body/query da requisição — não há nenhum campo de identidade lido do
// request em lugar nenhum deste arquivo.
//
// CHECAGEM AUTORITATIVA DE EQUIPE (E2.7-C) — achado da própria auditoria:
// `WHERE user_id = auth.uid()` sozinho garante "só a própria linha", mas
// NUNCA garantiu "nunca uma conta de equipe" — dependia só do fato de que
// nenhum fluxo real hoje vincula `embaixadoras.user_id` a uma conta
// `papel='equipe'` (invariante de aplicação, não imposta por constraint no
// banco). Por isso `checkIsEquipe` roda ANTES de qualquer consulta a
// `embaixadoras` e, se `true`, nega incondicionalmente — mesmo que
// `findMinhaEmbaixadora` viesse a encontrar uma linha `ativa` pra esse uid
// (inconsistência futura). Equipe nunca recebe dado do Portal, ponto final,
// independente do que exista (ou venha a existir) em `embaixadoras`.
//
// SOMENTE LEITURA — esta function nunca escreve em `public.embaixadoras`
// nem em nenhuma outra tabela.
//
// PRIVACIDADE — a busca é sempre `WHERE user_id = auth.uid()` (responsabilidade
// de `findMinhaEmbaixadora`, injetada por index.ts) — uma Embaixadora nunca
// pode ver os dados de outra, porque o filtro nunca aceita um id vindo de
// fora, só o do próprio token.

import { isPortalEligible, projectMinhaEmbaixadora, type MinhaEmbaixadoraRow } from "./logic.ts"

export type AuthorizeResult = { authorized: true; uid: string } | { authorized: false; status: 401 }

export interface GetMyEmbaixadoraDependencies {
  allowedOrigins: readonly string[]
  /** Valida o JWT do header Authorization e devolve o uid real (via auth.getUser). */
  authorize: (authorizationHeader: string | null) => Promise<AuthorizeResult>
  /** Checagem autoritativa (RPC is_equipe() ou equivalente adequado — ver index.ts) pro uid do JWT. `true` NEGA o Portal incondicionalmente, ANTES de qualquer consulta a embaixadoras — nunca uma decisão por ausência/ambiguidade, sempre uma confirmação positiva de "não é equipe" antes de prosseguir. */
  checkIsEquipe: (uid: string) => Promise<boolean>
  /** SEMPRE filtra por `user_id = uid` (o uid vem só de `authorize`, nunca do request) — devolve `null` se não houver linha, nunca lança por isso (não é erro, é resultado normal pra conta sem vínculo). Só é chamada depois de `checkIsEquipe` confirmar `false`. */
  findMinhaEmbaixadora: (uid: string) => Promise<MinhaEmbaixadoraRow | null>
  /** Nunca deve receber nome, e-mail, telefone ou código de indicação — só o uid (identificador interno) e o tipo de evento. */
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

export function createGetMyEmbaixadoraHandler(dependencies: GetMyEmbaixadoraDependencies) {
  return async (req: Request): Promise<Response> => {
    const headers = cors(req.headers.get("origin"), dependencies.allowedOrigins)
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers })
    if (!headers["Access-Control-Allow-Origin"]) return json({ error: "origin_not_allowed" }, 403, headers)
    if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405, headers)

    // Autorização ANTES de qualquer acesso ao banco — mesmo padrão de
    // list-ambassadors-admin/handler.ts.
    const auth = await dependencies.authorize(req.headers.get("authorization"))
    if (!auth.authorized) return json({ error: "unauthorized" }, 401, headers)

    // CHECAGEM AUTORITATIVA (E2.7-C) — roda ANTES de tocar em embaixadoras.
    // `true` nega incondicionalmente, mesmo que uma linha ativa exista pra
    // esse uid (nunca chega nem a consultar embaixadoras nesse caso).
    let isEquipe: boolean
    try {
      isEquipe = await dependencies.checkIsEquipe(auth.uid)
    } catch {
      dependencies.logEvent({ event: "get_my_embaixadora_error", actorUid: auth.uid, reason: "equipe_check_failed" })
      return json({ error: "internal_error" }, 500, headers)
    }

    if (isEquipe) {
      // Mesma resposta genérica de qualquer outra negação — nunca revela
      // publicamente que o motivo foi "é equipe" (evitaria diferenciar
      // "equipe" de "sem vínculo"/"não ativa" olhando só a resposta).
      dependencies.logEvent({ event: "get_my_embaixadora_denied", actorUid: auth.uid, reason: "equipe" })
      return json({ error: "embaixadora_nao_encontrada" }, 404, headers)
    }

    let row: MinhaEmbaixadoraRow | null
    try {
      row = await dependencies.findMinhaEmbaixadora(auth.uid)
    } catch {
      dependencies.logEvent({ event: "get_my_embaixadora_error", actorUid: auth.uid, reason: "query_failed" })
      return json({ error: "internal_error" }, 500, headers)
    }

    // Mesmo 404 genérico pra "não existe linha" e "existe mas não é
    // elegível" (ex.: conta sem vínculo, Embaixadora convidada/inativa/
    // rejeitada) — nunca diferencia publicamente o motivo.
    if (!row || !isPortalEligible(row.status)) {
      dependencies.logEvent({ event: "get_my_embaixadora_denied", actorUid: auth.uid, reason: "nao_elegivel" })
      return json({ error: "embaixadora_nao_encontrada" }, 404, headers)
    }

    dependencies.logEvent({ event: "get_my_embaixadora_success", actorUid: auth.uid })
    return json(projectMinhaEmbaixadora(row), 200, headers)
  }
}
