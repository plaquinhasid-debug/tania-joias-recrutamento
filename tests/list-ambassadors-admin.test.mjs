import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { createListAmbassadorsAdminHandler } from "../supabase/functions/list-ambassadors-admin/handler.ts"
import { projectEmbaixadora, projectEmbaixadoras } from "../supabase/functions/list-ambassadors-admin/logic.ts"

// -----------------------------------------------------------------------
// EMBAIXADORAS TANIA JOIAS V1 — E2.3-B. Testes da Edge Function
// `list-ambassadors-admin`, todos com doubles/mocks — NENHUMA conexão real
// com Supabase, NENHUMA leitura real do banco. `handler.ts` é chamado
// diretamente (sem `Deno.serve`, sem cliente Supabase real). Mesmo padrão
// já usado em create-ambassador-invite.test.mjs.
// -----------------------------------------------------------------------

const ALLOWED_ORIGIN = "https://recrutamento.taniajoiasmaua.com.br"
const EQUIPE_UID = "11111111-1111-1111-1111-111111111111"

const SAMPLE_ROW = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  nome: "Maria Teste",
  telefone_normalizado: "5511999999999",
  email: "maria@email.com",
  instagram: "maria.revende",
  codigo_referral: "ABCD2345",
  status: "convidada",
  created_at: "2026-09-16T10:00:00.000Z",
  aprovada_em: null,
}

async function alwaysEquipeAuthorize() {
  return { authorized: true, uid: EQUIPE_UID }
}

/** Simula o authorize real de index.ts reagindo ao header, sem tocar Supabase de verdade. */
async function realisticAuthorize(header) {
  if (header === "Bearer equipe-valida") return { authorized: true, uid: EQUIPE_UID }
  if (header === "Bearer sem-papel") return { authorized: false, status: 403 }
  return { authorized: false, status: 401 }
}

function makeDeps(overrides = {}) {
  const logs = []
  const deps = {
    allowedOrigins: [ALLOWED_ORIGIN],
    authorize: alwaysEquipeAuthorize,
    listEmbaixadoras: async () => [],
    logEvent: (fields) => logs.push(fields),
    ...overrides,
  }
  return { deps, logs }
}

function makeRequest({ method = "GET", origin = ALLOWED_ORIGIN, authorization = "Bearer equipe-valida" } = {}) {
  const headers = new Headers()
  if (origin !== null) headers.set("origin", origin)
  if (authorization !== null) headers.set("authorization", authorization)
  return new Request("https://example.invalid/list-ambassadors-admin", { method, headers })
}

// =========================================================================
// HTTP / CORS
// =========================================================================

test("HTTP: OPTIONS -> 204 com CORS", async () => {
  const { deps } = makeDeps()
  const handler = createListAmbassadorsAdminHandler(deps)
  const res = await handler(makeRequest({ method: "OPTIONS" }))
  assert.equal(res.status, 204)
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), ALLOWED_ORIGIN)
})

test("HTTP: origem permitida -> header CORS presente na resposta", async () => {
  const { deps } = makeDeps()
  const handler = createListAmbassadorsAdminHandler(deps)
  const res = await handler(makeRequest())
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), ALLOWED_ORIGIN)
})

test("HTTP: origem não permitida -> 403, sem CORS permissivo", async () => {
  const { deps } = makeDeps()
  const handler = createListAmbassadorsAdminHandler(deps)
  const res = await handler(makeRequest({ origin: "https://site-nao-autorizado.example.com" }))
  assert.equal(res.status, 403)
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), null)
  assert.deepEqual(await res.json(), { error: "origin_not_allowed" })
})

test("HTTP: método correto (GET) -> segue o fluxo normal", async () => {
  const { deps } = makeDeps()
  const handler = createListAmbassadorsAdminHandler(deps)
  const res = await handler(makeRequest({ method: "GET" }))
  assert.equal(res.status, 200)
})

test("HTTP: método indevido (POST) -> 405", async () => {
  const { deps } = makeDeps()
  const handler = createListAmbassadorsAdminHandler(deps)
  const res = await handler(makeRequest({ method: "POST" }))
  assert.equal(res.status, 405)
  assert.deepEqual(await res.json(), { error: "method_not_allowed" })
})

// =========================================================================
// AUTORIZAÇÃO
// =========================================================================

test("AUTH: Authorization ausente -> 401", async () => {
  const { deps } = makeDeps({ authorize: realisticAuthorize })
  const handler = createListAmbassadorsAdminHandler(deps)
  const res = await handler(makeRequest({ authorization: null }))
  assert.equal(res.status, 401)
  assert.deepEqual(await res.json(), { error: "unauthorized" })
})

test("AUTH: JWT inválido -> 401", async () => {
  const { deps } = makeDeps({ authorize: realisticAuthorize })
  const handler = createListAmbassadorsAdminHandler(deps)
  const res = await handler(makeRequest({ authorization: "Bearer lixo-invalido" }))
  assert.equal(res.status, 401)
})

test("AUTH: authenticated não-equipe -> 403", async () => {
  const { deps } = makeDeps({ authorize: realisticAuthorize })
  const handler = createListAmbassadorsAdminHandler(deps)
  const res = await handler(makeRequest({ authorization: "Bearer sem-papel" }))
  assert.equal(res.status, 403)
  assert.deepEqual(await res.json(), { error: "forbidden" })
})

test("AUTH: equipe autorizada -> 200", async () => {
  const { deps } = makeDeps({ authorize: realisticAuthorize })
  const handler = createListAmbassadorsAdminHandler(deps)
  const res = await handler(makeRequest({ authorization: "Bearer equipe-valida" }))
  assert.equal(res.status, 200)
})

test("AUTH: autorização acontece antes de qualquer chamada ao banco", async () => {
  let listCalled = false
  const { deps } = makeDeps({
    authorize: async () => ({ authorized: false, status: 401 }),
    listEmbaixadoras: async () => {
      listCalled = true
      return []
    },
  })
  const handler = createListAmbassadorsAdminHandler(deps)
  await handler(makeRequest({ authorization: null }))
  assert.equal(listCalled, false, "listEmbaixadoras não deveria ser chamada sem autorização")
})

// =========================================================================
// LISTAGEM
// =========================================================================

test("LISTAGEM: banco vazio -> { embaixadoras: [] }, nunca erro", async () => {
  const { deps } = makeDeps({ listEmbaixadoras: async () => [] })
  const handler = createListAmbassadorsAdminHandler(deps)
  const res = await handler(makeRequest())
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { embaixadoras: [] })
})

test("LISTAGEM: uma Embaixadora -> devolvida corretamente", async () => {
  const { deps } = makeDeps({ listEmbaixadoras: async () => [SAMPLE_ROW] })
  const handler = createListAmbassadorsAdminHandler(deps)
  const res = await handler(makeRequest())
  const bodyJson = await res.json()
  assert.equal(bodyJson.embaixadoras.length, 1)
  assert.equal(bodyJson.embaixadoras[0].nome, "Maria Teste")
})

test("LISTAGEM: múltiplas Embaixadoras -> todas devolvidas", async () => {
  const rows = [
    { ...SAMPLE_ROW, id: "id-1", nome: "Primeira" },
    { ...SAMPLE_ROW, id: "id-2", nome: "Segunda" },
    { ...SAMPLE_ROW, id: "id-3", nome: "Terceira" },
  ]
  const { deps } = makeDeps({ listEmbaixadoras: async () => rows })
  const handler = createListAmbassadorsAdminHandler(deps)
  const res = await handler(makeRequest())
  const bodyJson = await res.json()
  assert.equal(bodyJson.embaixadoras.length, 3)
})

test("LISTAGEM: ordenação — o handler preserva exatamente a ordem devolvida por listEmbaixadoras (a ordenação real é responsabilidade do .order('created_at', {ascending:false}) em index.ts, não testável sem rede real)", async () => {
  const rows = [
    { ...SAMPLE_ROW, id: "id-mais-recente", created_at: "2026-09-16T12:00:00.000Z" },
    { ...SAMPLE_ROW, id: "id-mais-antiga", created_at: "2026-09-10T12:00:00.000Z" },
  ]
  const { deps } = makeDeps({ listEmbaixadoras: async () => rows })
  const handler = createListAmbassadorsAdminHandler(deps)
  const res = await handler(makeRequest())
  const bodyJson = await res.json()
  assert.deepEqual(
    bodyJson.embaixadoras.map((e) => e.id),
    ["id-mais-recente", "id-mais-antiga"],
  )
})

test("LISTAGEM: instagram null é preservado (não vira string vazia nem some)", async () => {
  const { deps } = makeDeps({ listEmbaixadoras: async () => [{ ...SAMPLE_ROW, instagram: null }] })
  const handler = createListAmbassadorsAdminHandler(deps)
  const res = await handler(makeRequest())
  const bodyJson = await res.json()
  assert.equal(bodyJson.embaixadoras[0].instagram, null)
})

test("LISTAGEM: aprovada_em null é preservado (Embaixadora ainda não ativa)", async () => {
  const { deps } = makeDeps({ listEmbaixadoras: async () => [{ ...SAMPLE_ROW, aprovada_em: null }] })
  const handler = createListAmbassadorsAdminHandler(deps)
  const res = await handler(makeRequest())
  const bodyJson = await res.json()
  assert.equal(bodyJson.embaixadoras[0].aprovada_em, null)
})

for (const status of ["convidada", "ativa", "inativa", "rejeitada"]) {
  test(`LISTAGEM: status '${status}' é preservado sem transformação`, async () => {
    const { deps } = makeDeps({ listEmbaixadoras: async () => [{ ...SAMPLE_ROW, status }] })
    const handler = createListAmbassadorsAdminHandler(deps)
    const res = await handler(makeRequest())
    const bodyJson = await res.json()
    assert.equal(bodyJson.embaixadoras[0].status, status)
  })
}

// =========================================================================
// ERROS
// =========================================================================

test("ERRO: falha de query (Error real) -> 500 sanitizado, nunca vaza detalhe", async () => {
  const { deps, logs } = makeDeps({
    listEmbaixadoras: async () => {
      throw new Error("connection to postgres failed at host db.internal.example telefone=5511999998888")
    },
  })
  const handler = createListAmbassadorsAdminHandler(deps)
  const res = await handler(makeRequest())
  assert.equal(res.status, 500)
  const bodyJson = await res.json()
  assert.deepEqual(bodyJson, { error: "internal_error" })
  assert.ok(!JSON.stringify(bodyJson).includes("5511999998888"))
  const logsAsText = JSON.stringify(logs)
  assert.ok(!logsAsText.includes("connection to postgres"), "log não deveria conter a mensagem de erro crua")
  assert.ok(!logsAsText.includes("5511999998888"))
})

test("ERRO: falha inesperada (objeto não-Error) -> 500 sanitizado", async () => {
  const { deps } = makeDeps({
    listEmbaixadoras: async () => {
      throw { unexpected: true, code: "XX000" }
    },
  })
  const handler = createListAmbassadorsAdminHandler(deps)
  const res = await handler(makeRequest())
  assert.equal(res.status, 500)
  assert.deepEqual(await res.json(), { error: "internal_error" })
})

// =========================================================================
// PRIVACIDADE / CAMPOS SENSÍVEIS — via handler (integração dos mocks)
// =========================================================================

test("PRIVACIDADE: mesmo se listEmbaixadoras devolver campos extras sensíveis, a resposta nunca os inclui (projeção explícita)", async () => {
  const rowComCamposSensiveis = {
    ...SAMPLE_ROW,
    invite_token_hash: "0".repeat(64),
    invite_expira_em: "2026-09-23T00:00:00.000Z",
    invite_claim_id: "claim-id-secreto",
    invite_claimed_em: "2026-09-16T11:00:00.000Z",
    invite_claim_expira_em: "2026-09-16T11:15:00.000Z",
    invite_token_usado_em: null,
    user_id: "user-id-secreto",
    aprovada_por: "aprovada-por-secreto",
  }
  const { deps } = makeDeps({ listEmbaixadoras: async () => [rowComCamposSensiveis] })
  const handler = createListAmbassadorsAdminHandler(deps)
  const res = await handler(makeRequest())
  const bodyText = JSON.stringify(await res.json())
  for (const forbidden of [
    "invite_token_hash",
    "invite_expira_em",
    "invite_claim_id",
    "invite_claimed_em",
    "invite_claim_expira_em",
    "invite_token_usado_em",
    "user_id",
    "aprovada_por",
    "claim-id-secreto",
    "user-id-secreto",
    "aprovada-por-secreto",
  ]) {
    assert.ok(!bodyText.includes(forbidden), `campo/valor sensível "${forbidden}" vazou na resposta`)
  }
})

test("PRIVACIDADE: resposta de sucesso contém EXATAMENTE os 9 campos esperados, nunca mais", async () => {
  const { deps } = makeDeps({ listEmbaixadoras: async () => [SAMPLE_ROW] })
  const handler = createListAmbassadorsAdminHandler(deps)
  const res = await handler(makeRequest())
  const bodyJson = await res.json()
  assert.deepEqual(
    Object.keys(bodyJson.embaixadoras[0]).sort(),
    ["aprovada_em", "codigo_referral", "created_at", "email", "id", "instagram", "nome", "status", "telefone_normalizado"],
  )
})

test("PRIVACIDADE: nenhum log contém nome/telefone/email/instagram/lista", async () => {
  const { deps, logs } = makeDeps({ listEmbaixadoras: async () => [SAMPLE_ROW] })
  const handler = createListAmbassadorsAdminHandler(deps)
  await handler(makeRequest())
  const logsAsText = JSON.stringify(logs)
  assert.ok(!logsAsText.includes("Maria Teste"))
  assert.ok(!logsAsText.includes("5511999999999"))
  assert.ok(!logsAsText.includes("maria@email.com"))
  assert.ok(!logsAsText.includes("maria.revende"))
})

test("PRIVACIDADE: evento de sucesso loga só metadados minimizados (contagem, nunca a lista)", async () => {
  const { deps, logs } = makeDeps({ listEmbaixadoras: async () => [SAMPLE_ROW, SAMPLE_ROW] })
  const handler = createListAmbassadorsAdminHandler(deps)
  await handler(makeRequest())
  const successLog = logs.find((l) => l.event === "list_ambassadors")
  assert.ok(successLog)
  assert.deepEqual(Object.keys(successLog).sort(), ["actorUid", "count", "event"])
  assert.equal(successLog.count, 2)
})

// =========================================================================
// DEFESA EM PROFUNDIDADE — projectEmbaixadora/projectEmbaixadoras diretas
// (a própria função pura, não só via handler)
// =========================================================================

test("DEFESA EM PROFUNDIDADE: projectEmbaixadora nunca inclui campos extras do objeto de entrada, mesmo que eles existam", () => {
  const rowComExtras = {
    ...SAMPLE_ROW,
    invite_token_hash: "segredo",
    invite_claim_id: "segredo",
    user_id: "segredo",
    aprovada_por: "segredo",
    campo_futuro_desconhecido: "segredo",
  }
  const projected = projectEmbaixadora(rowComExtras)
  assert.deepEqual(
    Object.keys(projected).sort(),
    ["aprovada_em", "codigo_referral", "created_at", "email", "id", "instagram", "nome", "status", "telefone_normalizado"],
  )
  assert.ok(!JSON.stringify(projected).includes("segredo"))
})

test("DEFESA EM PROFUNDIDADE: projectEmbaixadoras aplica a mesma projeção a cada linha de uma lista", () => {
  const rows = [
    { ...SAMPLE_ROW, id: "a", invite_token_hash: "segredo-a" },
    { ...SAMPLE_ROW, id: "b", invite_token_hash: "segredo-b" },
  ]
  const projected = projectEmbaixadoras(rows)
  assert.equal(projected.length, 2)
  assert.ok(!JSON.stringify(projected).includes("segredo"))
})

// =========================================================================
// AUDITORIA ESTÁTICA DE CÓDIGO-FONTE
// =========================================================================

test("index.ts: nenhuma escrita no banco — nunca .insert(/.update(/.delete(/.upsert( em nenhuma tabela", () => {
  const source = fs.readFileSync(
    new URL("../supabase/functions/list-ambassadors-admin/index.ts", import.meta.url),
    "utf8",
  )
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  for (const writeMethod of [".insert(", ".update(", ".delete(", ".upsert("]) {
    assert.ok(!codeOnly.includes(writeMethod), `index.ts não deveria conter '${writeMethod}' — esta function é somente leitura`)
  }
})

test("index.ts: SELECT explícito de colunas — nunca .select(\"*\")", () => {
  const source = fs.readFileSync(
    new URL("../supabase/functions/list-ambassadors-admin/index.ts", import.meta.url),
    "utf8",
  )
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  assert.ok(!/\.select\(\s*["']\*["']\s*\)/.test(codeOnly), "nunca usar select(\"*\") — sempre lista de colunas explícita")
  assert.match(codeOnly, /\.select\(\s*["']id, nome, telefone_normalizado, email, instagram, codigo_referral, status, created_at, aprovada_em["']\s*\)/)
})

test("index.ts: env vars obrigatórias usam requireEnv — não Deno.env.get(...)! direto", () => {
  const source = fs.readFileSync(
    new URL("../supabase/functions/list-ambassadors-admin/index.ts", import.meta.url),
    "utf8",
  )
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  for (const varName of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
    assert.match(
      codeOnly,
      new RegExp(`const ${varName} = requireEnv\\("${varName}"\\)`),
      `${varName} deveria ser lida via requireEnv()`,
    )
  }
})
