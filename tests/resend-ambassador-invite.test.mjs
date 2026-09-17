import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { createResendAmbassadorInviteHandler } from "../supabase/functions/resend-ambassador-invite/handler.ts"
import {
  classifyResendFailure,
  computeNewExpiraEm,
  isPlausibleEmbaixadoraId,
  isPlausibleUpdatedAt,
  sha256Hex,
} from "../supabase/functions/resend-ambassador-invite/logic.ts"

// -----------------------------------------------------------------------
// EMBAIXADORAS TANIA JOIAS V1 — E2.6-A. Testes da Edge Function
// `resend-ambassador-invite`, todos com doubles/mocks — NENHUMA conexão
// real com Supabase, NENHUMA linha de `embaixadoras` é lida/escrita em
// lugar nenhum. `handler.ts` é chamado diretamente (sem `Deno.serve`, sem
// cliente Supabase real). Mesmo padrão de create-ambassador-invite.test.mjs.
// -----------------------------------------------------------------------

const ALLOWED_ORIGIN = "https://recrutamento.taniajoiasmaua.com.br"
const INVITE_BASE_URL = "https://taniajoiasmaua.com.br/embaixadoras/convite"
const EQUIPE_UID = "11111111-1111-1111-1111-111111111111"
const EMBAIXADORA_ID = "aaaaaaaa-0000-0000-0000-000000000001"
const EXPECTED_UPDATED_AT = "2026-09-17T08:00:00.000Z"

const VALID_BODY = { embaixadora_id: EMBAIXADORA_ID, expected_updated_at: EXPECTED_UPDATED_AT }

function makeRandomBytes(seed = 0) {
  let counter = seed
  return (n) => {
    const arr = new Uint8Array(n)
    for (let i = 0; i < n; i++) {
      arr[i] = counter % 62
      counter++
    }
    return arr
  }
}

function spyRandomBytes(inner) {
  const calls = []
  const fn = (n) => {
    calls.push(n)
    return inner(n)
  }
  return { fn, calls }
}

async function alwaysEquipeAuthorize() {
  return { authorized: true, uid: EQUIPE_UID }
}

async function realisticAuthorize(header) {
  if (header === "Bearer equipe-valida") return { authorized: true, uid: EQUIPE_UID }
  if (header === "Bearer sem-papel") return { authorized: false, status: 403 }
  return { authorized: false, status: 401 }
}

function makeDeps(overrides = {}) {
  const logs = []
  const resendCalls = []
  let resendImpl =
    overrides.resendInvite ??
    (async (params) => {
      resendCalls.push(params)
      return { ok: true, embaixadoraId: EMBAIXADORA_ID, inviteExpiraEm: "2026-09-24T08:00:00.000Z" }
    })

  const deps = {
    allowedOrigins: [ALLOWED_ORIGIN],
    inviteBaseUrl: INVITE_BASE_URL,
    randomBytes: makeRandomBytes(),
    now: () => Date.parse("2026-09-17T08:00:00.000Z"),
    authorize: alwaysEquipeAuthorize,
    logEvent: (fields) => logs.push(fields),
    ...overrides,
    resendInvite: async (params) => {
      if (!overrides.resendInvite) resendCalls.push(params)
      return resendImpl(params)
    },
  }
  return { deps, logs, resendCalls }
}

function makeRequest({ method = "POST", origin = ALLOWED_ORIGIN, authorization = "Bearer equipe-valida", body = VALID_BODY } = {}) {
  const headers = new Headers()
  if (origin !== null) headers.set("origin", origin)
  if (authorization !== null) headers.set("authorization", authorization)
  return new Request("https://example.invalid/resend-ambassador-invite", {
    method,
    headers,
    body: method === "OPTIONS" || method === "GET" ? undefined : body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  })
}

// =========================================================================
// AUTH
// =========================================================================

test("AUTH: sem Authorization -> 401", async () => {
  const { deps } = makeDeps({ authorize: realisticAuthorize })
  const handler = createResendAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ authorization: null }))
  assert.equal(res.status, 401)
  assert.deepEqual(await res.json(), { error: "unauthorized" })
})

test("AUTH: JWT inválido -> 401", async () => {
  const { deps } = makeDeps({ authorize: realisticAuthorize })
  const handler = createResendAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ authorization: "Bearer lixo-invalido" }))
  assert.equal(res.status, 401)
})

test("AUTH: authenticated sem_papel -> 403", async () => {
  const { deps } = makeDeps({ authorize: realisticAuthorize })
  const handler = createResendAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ authorization: "Bearer sem-papel" }))
  assert.equal(res.status, 403)
  assert.deepEqual(await res.json(), { error: "forbidden" })
})

test("AUTH: equipe -> autorizado (200)", async () => {
  const { deps } = makeDeps({ authorize: realisticAuthorize })
  const handler = createResendAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ authorization: "Bearer equipe-valida" }))
  assert.equal(res.status, 200)
})

test("AUTH: autorização acontece antes de qualquer parsing de body — JSON inválido com auth negada ainda vira 401/403, nunca 400", async () => {
  const { deps } = makeDeps({ authorize: async () => ({ authorized: false, status: 401 }) })
  const handler = createResendAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ body: "{ isso nao e json" }))
  assert.equal(res.status, 401)
})

// =========================================================================
// PAYLOAD
// =========================================================================

test("PAYLOAD: embaixadora_id ausente -> 400", async () => {
  const { deps } = makeDeps()
  const handler = createResendAmbassadorInviteHandler(deps)
  const { embaixadora_id, ...rest } = VALID_BODY
  const res = await handler(makeRequest({ body: rest }))
  assert.equal(res.status, 400)
  assert.deepEqual(await res.json(), { error: "embaixadora_id_invalido" })
})

for (const bad of ["nao-e-uuid", "", "  ", "11111111-1111-1111-1111-11111111111", 123, null]) {
  test(`PAYLOAD: embaixadora_id malformado (${JSON.stringify(bad)}) -> 400`, async () => {
    const { deps } = makeDeps()
    const handler = createResendAmbassadorInviteHandler(deps)
    const res = await handler(makeRequest({ body: { ...VALID_BODY, embaixadora_id: bad } }))
    assert.equal(res.status, 400)
    assert.deepEqual(await res.json(), { error: "embaixadora_id_invalido" })
  })
}

test("PAYLOAD: expected_updated_at ausente -> 400", async () => {
  const { deps } = makeDeps()
  const handler = createResendAmbassadorInviteHandler(deps)
  const { expected_updated_at, ...rest } = VALID_BODY
  const res = await handler(makeRequest({ body: rest }))
  assert.equal(res.status, 400)
  assert.deepEqual(await res.json(), { error: "expected_updated_at_invalido" })
})

for (const bad of ["nao-e-data", "", "   ", 123, null, {}]) {
  test(`PAYLOAD: expected_updated_at malformado (${JSON.stringify(bad)}) -> 400`, async () => {
    const { deps } = makeDeps()
    const handler = createResendAmbassadorInviteHandler(deps)
    const res = await handler(makeRequest({ body: { ...VALID_BODY, expected_updated_at: bad } }))
    assert.equal(res.status, 400)
    assert.deepEqual(await res.json(), { error: "expected_updated_at_invalido" })
  })
}

test("PAYLOAD: campos extras (nome/telefone/email/status/user_id) são ignorados, nunca chegam a resendInvite", async () => {
  const { deps, resendCalls } = makeDeps()
  const handler = createResendAmbassadorInviteHandler(deps)
  const adversarialBody = {
    ...VALID_BODY,
    nome: "HACKED",
    telefone: "5511999999999",
    email: "hacked@example.com",
    status: "ativa",
    user_id: "22222222-2222-2222-2222-222222222222",
  }
  const res = await handler(makeRequest({ body: adversarialBody }))
  assert.equal(res.status, 200)
  assert.deepEqual(Object.keys(resendCalls[0]).sort(), ["embaixadoraId", "expectedUpdatedAt", "newExpiraEm", "newTokenHash"])
})

// =========================================================================
// TOKEN
// =========================================================================

test("TOKEN: 32 bytes de entropia são pedidos antes de qualquer codificação", async () => {
  const spy = spyRandomBytes(makeRandomBytes())
  const { deps } = makeDeps({ randomBytes: spy.fn })
  const handler = createResendAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  assert.equal(res.status, 200)
  assert.equal(spy.calls[0], 32)
})

test("TOKEN: invite_url usa base64url sem padding, sempre como segmento de path novo", async () => {
  const { deps } = makeDeps()
  const handler = createResendAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  const bodyJson = await res.json()
  const token = bodyJson.invite_url.slice(INVITE_BASE_URL.length + 1)
  assert.match(token, /^[A-Za-z0-9_-]+$/)
  assert.ok(!token.includes("="))
  assert.ok(!token.includes("+") && !token.includes("/"))
})

test("TOKEN: hash enviado à RPC é exatamente SHA-256 hex do token bruto da invite_url", async () => {
  const { deps, resendCalls } = makeDeps()
  const handler = createResendAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  const bodyJson = await res.json()
  const tokenBruto = bodyJson.invite_url.slice(INVITE_BASE_URL.length + 1)
  const expectedHash = await sha256Hex(tokenBruto)
  assert.equal(resendCalls[0].newTokenHash, expectedHash)
  assert.match(resendCalls[0].newTokenHash, /^[0-9a-f]{64}$/)
})

test("TOKEN: resendInvite nunca recebe o token bruto, só o hash", async () => {
  const { deps, resendCalls } = makeDeps()
  const handler = createResendAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  const bodyJson = await res.json()
  const tokenBruto = bodyJson.invite_url.slice(INVITE_BASE_URL.length + 1)
  assert.ok(!JSON.stringify(resendCalls[0]).includes(tokenBruto))
})

test("TOKEN: logger nunca recebe o token bruto nem a invite_url", async () => {
  const { deps, logs } = makeDeps()
  const handler = createResendAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  const bodyJson = await res.json()
  const tokenBruto = bodyJson.invite_url.slice(INVITE_BASE_URL.length + 1)
  const logsAsText = JSON.stringify(logs)
  assert.ok(!logsAsText.includes(tokenBruto))
  assert.ok(!logsAsText.includes(bodyJson.invite_url))
  assert.ok(!logsAsText.includes("http"))
})

test("TOKEN: duas chamadas seguidas geram tokens/hashes diferentes (randomBytes não é reaproveitado)", async () => {
  const { deps } = makeDeps({ randomBytes: (() => { let c = 0; return (n) => { const a = new Uint8Array(n); for (let i = 0; i < n; i++) a[i] = (c++) % 251; return a } })() })
  const handler = createResendAmbassadorInviteHandler(deps)
  const res1 = await handler(makeRequest())
  const res2 = await handler(makeRequest())
  const url1 = (await res1.json()).invite_url
  const url2 = (await res2.json()).invite_url
  assert.notEqual(url1, url2)
})

// =========================================================================
// EXPIRAÇÃO
// =========================================================================

test("EXPIRAÇÃO: newExpiraEm enviado à RPC é now()+7 dias, calculado a partir de `now` injetado", async () => {
  const { deps, resendCalls } = makeDeps({ now: () => Date.parse("2026-01-01T00:00:00.000Z") })
  const handler = createResendAmbassadorInviteHandler(deps)
  await handler(makeRequest())
  assert.equal(resendCalls[0].newExpiraEm, "2026-01-08T00:00:00.000Z")
})

test("EXPIRAÇÃO: resposta de sucesso devolve invite_expira_em exatamente como a RPC retornou", async () => {
  const { deps } = makeDeps({
    resendInvite: async () => ({ ok: true, embaixadoraId: EMBAIXADORA_ID, inviteExpiraEm: "2026-12-25T00:00:00.000Z" }),
  })
  const handler = createResendAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  const bodyJson = await res.json()
  assert.equal(bodyJson.invite_expira_em, "2026-12-25T00:00:00.000Z")
})

// =========================================================================
// CONFLITO / CONCORRÊNCIA (RPC devolve "não aconteceu")
// =========================================================================

for (const [reason, status] of [
  ["not_found", 404],
  ["nao_convidada", 409],
  ["resgate_em_andamento", 409],
  ["estado_desatualizado", 409],
]) {
  test(`CONFLITO: resendInvite ok:false reason='${reason}' -> ${status}`, async () => {
    const { deps, logs } = makeDeps({ resendInvite: async () => ({ ok: false, reason }) })
    const handler = createResendAmbassadorInviteHandler(deps)
    const res = await handler(makeRequest())
    assert.equal(res.status, status)
    assert.deepEqual(await res.json(), { error: reason })
    const conflictLog = logs.find((l) => l.event === "resend_conflict")
    assert.ok(conflictLog)
    assert.equal(conflictLog.reason, reason)
  })
}

test("CONFLITO: estado_desatualizado é exatamente o resultado de duas tentativas concorrentes na mesma linha (a segunda não gera link fantasma)", async () => {
  // Simula o comportamento real da RPC: a primeira chamada "vence" a
  // corrida (updated_at ainda bate), a segunda vê updated_at já mudado.
  let firstCallDone = false
  const { deps } = makeDeps({
    resendInvite: async () => {
      if (!firstCallDone) {
        firstCallDone = true
        return { ok: true, embaixadoraId: EMBAIXADORA_ID, inviteExpiraEm: "2026-09-24T08:00:00.000Z" }
      }
      return { ok: false, reason: "estado_desatualizado" }
    },
  })
  const handler = createResendAmbassadorInviteHandler(deps)
  const [res1, res2] = await Promise.all([handler(makeRequest()), handler(makeRequest())])
  const statuses = [res1.status, res2.status].sort()
  assert.deepEqual(statuses, [200, 409], "exatamente uma tentativa concorrente deveria ter sucesso, a outra um conflito explícito")
})

// =========================================================================
// ERRO INTERNO
// =========================================================================

test("ERRO: resendInvite rejeita (RPC falha) -> 500 sanitizado", async () => {
  const { deps, logs } = makeDeps({
    resendInvite: async () => {
      throw new Error("connection to postgres failed telefone=5511999998888")
    },
  })
  const handler = createResendAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  assert.equal(res.status, 500)
  assert.deepEqual(await res.json(), { error: "internal_error" })
  const logsAsText = JSON.stringify(logs)
  assert.ok(!logsAsText.includes("5511999998888"))
  assert.ok(!logsAsText.includes("connection to postgres"))
})

// =========================================================================
// HTTP
// =========================================================================

test("HTTP: OPTIONS -> 204 com CORS", async () => {
  const { deps } = makeDeps()
  const handler = createResendAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ method: "OPTIONS" }))
  assert.equal(res.status, 204)
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), ALLOWED_ORIGIN)
})

test("HTTP: origem não permitida -> 403, sem CORS permissivo", async () => {
  const { deps } = makeDeps()
  const handler = createResendAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ origin: "https://site-nao-autorizado.example.com" }))
  assert.equal(res.status, 403)
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), null)
})

test("HTTP: método inválido (GET) -> 405", async () => {
  const { deps } = makeDeps()
  const handler = createResendAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ method: "GET" }))
  assert.equal(res.status, 405)
})

test("HTTP: JSON inválido -> 400", async () => {
  const { deps } = makeDeps()
  const handler = createResendAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ body: "{ isso nao é json" }))
  assert.equal(res.status, 400)
  assert.deepEqual(await res.json(), { error: "invalid_json" })
})

// =========================================================================
// PRIVACIDADE
// =========================================================================

test("PRIVACIDADE: resposta de sucesso nunca contém a chave invite_token_hash nem embaixadora_id", async () => {
  const { deps } = makeDeps()
  const handler = createResendAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  const bodyJson = await res.json()
  assert.deepEqual(Object.keys(bodyJson).sort(), ["invite_expira_em", "invite_url"])
  assert.ok(!("invite_token_hash" in bodyJson))
})

test("PRIVACIDADE: nenhum log contém embaixadora_id em texto livre fora do campo estruturado esperado", async () => {
  const { deps, logs } = makeDeps()
  const handler = createResendAmbassadorInviteHandler(deps)
  await handler(makeRequest())
  const successLog = logs.find((l) => l.event === "resend_success")
  assert.ok(successLog)
  assert.deepEqual(Object.keys(successLog).sort(), ["actorUid", "embaixadoraId", "event", "success"])
  assert.equal(successLog.actorUid, EQUIPE_UID)
})

// =========================================================================
// logic.ts — funções puras isoladas
// =========================================================================

test("logic: isPlausibleEmbaixadoraId aceita só UUID v-qualquer bem formado", () => {
  assert.ok(isPlausibleEmbaixadoraId("aaaaaaaa-0000-0000-0000-000000000001"))
  assert.ok(isPlausibleEmbaixadoraId("AAAAAAAA-0000-0000-0000-000000000001"), "maiúsculas também são UUID válido")
  for (const bad of ["", "  ", "nao-e-uuid", 42, null, undefined, "aaaaaaaa-0000-0000-0000-00000000000"]) {
    assert.ok(!isPlausibleEmbaixadoraId(bad), `deveria rejeitar ${JSON.stringify(bad)}`)
  }
})

test("logic: isPlausibleUpdatedAt aceita string parseável como data, rejeita o resto", () => {
  assert.ok(isPlausibleUpdatedAt("2026-09-17T08:00:00.000Z"))
  for (const bad of ["", "   ", "nao-e-data", 123, null, undefined, {}]) {
    assert.ok(!isPlausibleUpdatedAt(bad), `deveria rejeitar ${JSON.stringify(bad)}`)
  }
})

test("logic: computeNewExpiraEm soma exatamente 7 dias ao now injetado", () => {
  const now = () => Date.parse("2026-03-01T12:00:00.000Z")
  assert.equal(computeNewExpiraEm(now), "2026-03-08T12:00:00.000Z")
})

test("logic: classifyResendFailure — linha não encontrada -> not_found", () => {
  assert.equal(classifyResendFailure(null), "not_found")
})

test("logic: classifyResendFailure — status diferente de convidada -> nao_convidada", () => {
  for (const status of ["ativa", "inativa", "rejeitada"]) {
    assert.equal(
      classifyResendFailure({ status, invite_token_usado_em: null, invite_claimed_em: null, invite_claim_expira_em: null }),
      "nao_convidada",
    )
  }
})

test("logic: classifyResendFailure — invite_token_usado_em preenchido -> nao_convidada mesmo com status convidada (linha inconsistente/corrida)", () => {
  assert.equal(
    classifyResendFailure({
      status: "convidada", invite_token_usado_em: "2026-09-16T00:00:00.000Z", invite_claimed_em: null, invite_claim_expira_em: null,
    }),
    "nao_convidada",
  )
})

test("logic: classifyResendFailure — claim ativo (não expirado) -> resgate_em_andamento", () => {
  const futuro = new Date(Date.now() + 60_000).toISOString()
  assert.equal(
    classifyResendFailure({
      status: "convidada", invite_token_usado_em: null, invite_claimed_em: new Date().toISOString(), invite_claim_expira_em: futuro,
    }),
    "resgate_em_andamento",
  )
})

test("logic: classifyResendFailure — claim já expirado NÃO conta como em andamento -> estado_desatualizado", () => {
  const passado = new Date(Date.now() - 60_000).toISOString()
  assert.equal(
    classifyResendFailure({
      status: "convidada", invite_token_usado_em: null, invite_claimed_em: new Date(Date.now() - 120_000).toISOString(), invite_claim_expira_em: passado,
    }),
    "estado_desatualizado",
  )
})

test("logic: classifyResendFailure — tudo elegível mas ainda assim 0 linhas -> estado_desatualizado (updated_at não bateu)", () => {
  assert.equal(
    classifyResendFailure({ status: "convidada", invite_token_usado_em: null, invite_claimed_em: null, invite_claim_expira_em: null }),
    "estado_desatualizado",
  )
})

// =========================================================================
// index.ts — ASSERÇÕES DE CÓDIGO-FONTE
// =========================================================================

test("index.ts: env vars obrigatórias usam requireEnv, não Deno.env.get(...)! direto", () => {
  const source = fs.readFileSync(new URL("../supabase/functions/resend-ambassador-invite/index.ts", import.meta.url), "utf8")
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  for (const varName of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "EMBAIXADORAS_INVITE_BASE_URL"]) {
    assert.match(codeOnly, new RegExp(`const ${varName} = requireEnv\\("${varName}"\\)`))
  }
})

test("index.ts: chama a RPC resend_ambassador_invite com os 4 parâmetros esperados, nunca .insert(/.update( direto na tabela", () => {
  const source = fs.readFileSync(new URL("../supabase/functions/resend-ambassador-invite/index.ts", import.meta.url), "utf8")
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  assert.match(codeOnly, /\.rpc\("resend_ambassador_invite",/)
  for (const p of ["p_embaixadora_id", "p_expected_updated_at", "p_new_token_hash", "p_new_expira_em"]) {
    assert.ok(codeOnly.includes(p), `parâmetro ${p} deveria ser enviado à RPC`)
  }
  assert.ok(!/\.from\("embaixadoras"\)\s*\.\s*update\(/.test(codeOnly), "nunca escrever em embaixadoras fora da RPC")
  assert.ok(!/\.from\("embaixadoras"\)\s*\.\s*insert\(/.test(codeOnly), "nunca inserir em embaixadoras")
})
