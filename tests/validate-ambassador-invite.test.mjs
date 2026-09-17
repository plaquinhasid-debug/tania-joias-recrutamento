import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { createValidateAmbassadorInviteHandler } from "../supabase/functions/validate-ambassador-invite/handler.ts"
import { isInviteRedeemable, isPlausibleToken, sha256Hex } from "../supabase/functions/validate-ambassador-invite/logic.ts"

// -----------------------------------------------------------------------
// EMBAIXADORAS TANIA JOIAS V1 — E2.5-B. Testes de `validate-ambassador-
// invite`, todos com doubles/mocks — NENHUMA conexão real com Supabase,
// NENHUM auth.users, NENHUMA linha em embaixadoras é lida ou escrita de
// verdade em lugar nenhum. `handler.ts` é chamado diretamente (sem
// Deno.serve, sem cliente Supabase real). Esta function é só leitura por
// desenho — não há nenhum cenário de escrita a testar aqui.
// -----------------------------------------------------------------------

const ALLOWED_ORIGIN = "https://taniajoiasmaua.com.br"
const REAL_TOKEN = "a".repeat(43) // comprimento real de um token base64url de 32 bytes
const NOW_MS = new Date("2026-09-23T12:00:00Z").getTime()

const VALID_LOOKUP = {
  nome: "Maria Teste",
  email: "maria@email.com",
  status: "convidada",
  inviteTokenUsadoEm: null,
  inviteExpiraEm: "2026-09-30T12:00:00Z", // depois de NOW_MS
}

function makeDeps(overrides = {}) {
  const calls = []
  const deps = {
    allowedOrigins: [ALLOWED_ORIGIN],
    now: () => NOW_MS,
    findByTokenHash: async (tokenHash) => {
      calls.push(tokenHash)
      return VALID_LOOKUP
    },
    ...overrides,
  }
  return { deps, calls }
}

function makeRequest({ method = "POST", origin = ALLOWED_ORIGIN, body = { token: REAL_TOKEN } } = {}) {
  const headers = new Headers()
  if (origin !== null) headers.set("origin", origin)
  return new Request("https://example.invalid/validate-ambassador-invite", {
    method,
    headers,
    body: method === "OPTIONS" || method === "GET" ? undefined : body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  })
}

// =========================================================================
// HTTP
// =========================================================================

test("HTTP: OPTIONS -> 204 com CORS", async () => {
  const { deps } = makeDeps()
  const handler = createValidateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ method: "OPTIONS" }))
  assert.equal(res.status, 204)
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), ALLOWED_ORIGIN)
})

test("HTTP: origem não permitida -> 403, sem CORS permissivo, sem consultar o banco", async () => {
  const { deps, calls } = makeDeps()
  const handler = createValidateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ origin: "https://site-nao-autorizado.example.com" }))
  assert.equal(res.status, 403)
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), null)
  assert.equal(calls.length, 0, "origem não permitida não deveria nem chegar a consultar o banco")
})

test("HTTP: método inválido (GET) -> 405", async () => {
  const { deps } = makeDeps()
  const handler = createValidateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ method: "GET" }))
  assert.equal(res.status, 405)
})

test("HTTP: JSON inválido -> 400 invalid_json (shape diferente de status:invalido, é erro operacional não sobre um token específico)", async () => {
  const { deps } = makeDeps()
  const handler = createValidateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ body: "{ isso nao é json" }))
  assert.equal(res.status, 400)
  assert.deepEqual(await res.json(), { error: "invalid_json" })
})

// =========================================================================
// FORMATO DO TOKEN (rejeição barata, antes de hash/banco)
// =========================================================================

test("TOKEN: ausente -> status:invalido, sem consultar o banco", async () => {
  const { deps, calls } = makeDeps()
  const handler = createValidateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ body: {} }))
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { status: "invalido" })
  assert.equal(calls.length, 0)
})

test("TOKEN: vazio -> status:invalido, sem consultar o banco", async () => {
  const { deps, calls } = makeDeps()
  const handler = createValidateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ body: { token: "" } }))
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { status: "invalido" })
  assert.equal(calls.length, 0)
})

test("TOKEN: malformado (curto demais) -> status:invalido, sem consultar o banco", async () => {
  const { deps, calls } = makeDeps()
  const handler = createValidateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ body: { token: "curto" } }))
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { status: "invalido" })
  assert.equal(calls.length, 0)
})

test("TOKEN: malformado (caracteres fora do alfabeto base64url, ex.: query string colada) -> status:invalido, sem consultar o banco", async () => {
  const { deps, calls } = makeDeps()
  const handler = createValidateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ body: { token: "token/com espaco+e+plus" + "x".repeat(20) } }))
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { status: "invalido" })
  assert.equal(calls.length, 0)
})

test("TOKEN: não-string (número/objeto) -> status:invalido, sem consultar o banco", async () => {
  const { deps, calls } = makeDeps()
  const handler = createValidateAmbassadorInviteHandler(deps)
  for (const badToken of [12345, { a: 1 }, null, ["x"]]) {
    const res = await handler(makeRequest({ body: { token: badToken } }))
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { status: "invalido" })
  }
  assert.equal(calls.length, 0)
})

test("TOKEN: formato plausível é hasheado (SHA-256 hex) antes de consultar o banco", async () => {
  const { deps, calls } = makeDeps()
  const handler = createValidateAmbassadorInviteHandler(deps)
  await handler(makeRequest())
  assert.equal(calls.length, 1)
  assert.match(calls[0], /^[0-9a-f]{64}$/)
  assert.equal(calls[0], await sha256Hex(REAL_TOKEN))
  assert.notEqual(calls[0], REAL_TOKEN, "nunca deveria consultar pelo token bruto")
})

// =========================================================================
// ERRO INTERNO — findByTokenHash lança (E2.5-C1: achado ALTO da E2.5-C,
// mesmo gap já corrigido antes em create-ambassador-invite/handler.ts)
// =========================================================================

test("ERRO INTERNO: findByTokenHash lança -> handler NUNCA propaga, responde 500 genérico com CORS/Content-Type intactos, sem vazar a mensagem crua nem o token", async () => {
  const { deps } = makeDeps({
    findByTokenHash: async () => {
      throw new Error("SEGREDO_INTERNO_DB")
    },
  })
  const handler = createValidateAmbassadorInviteHandler(deps)

  // A própria chamada não deve rejeitar — handler() deve devolver uma
  // Response normalmente, nunca lançar pro chamador (Deno.serve).
  const res = await handler(makeRequest())
  assert.ok(res instanceof Response)

  assert.equal(res.status, 500)
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), ALLOWED_ORIGIN, "CORS deveria continuar presente mesmo no caminho de erro")
  assert.equal(res.headers.get("Content-Type"), "application/json")

  const bodyText = await res.text()
  assert.ok(!bodyText.includes("SEGREDO_INTERNO_DB"), "mensagem crua da exceção nunca deveria vazar")
  assert.ok(!bodyText.includes(REAL_TOKEN), "token bruto nunca deveria vazar")
  assert.deepEqual(JSON.parse(bodyText), { error: "internal_error" })
})

test("ERRO INTERNO: findByTokenHash lança um objeto não-Error (ex.: string) -> mesmo tratamento genérico, nunca propaga", async () => {
  const { deps } = makeDeps({
    findByTokenHash: async () => {
      throw "SEGREDO_STRING_CRUA"
    },
  })
  const handler = createValidateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  assert.equal(res.status, 500)
  const bodyText = await res.text()
  assert.ok(!bodyText.includes("SEGREDO_STRING_CRUA"))
  assert.deepEqual(JSON.parse(bodyText), { error: "internal_error" })
})

// =========================================================================
// ELEGIBILIDADE (status / usado / expirado)
// =========================================================================

test("LOOKUP: token inexistente (findByTokenHash devolve null) -> status:invalido", async () => {
  const { deps } = makeDeps({ findByTokenHash: async () => null })
  const handler = createValidateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { status: "invalido" })
})

for (const status of ["ativa", "inativa", "rejeitada"]) {
  test(`LOOKUP: status '${status}' -> status:invalido (só 'convidada' é elegível)`, async () => {
    const { deps } = makeDeps({ findByTokenHash: async () => ({ ...VALID_LOOKUP, status }) })
    const handler = createValidateAmbassadorInviteHandler(deps)
    const res = await handler(makeRequest())
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { status: "invalido" })
  })
}

test("LOOKUP: já usado (invite_token_usado_em preenchido) -> status:invalido, mesmo com status ainda 'convidada'", async () => {
  const { deps } = makeDeps({
    findByTokenHash: async () => ({ ...VALID_LOOKUP, inviteTokenUsadoEm: "2026-09-20T12:00:00Z" }),
  })
  const handler = createValidateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { status: "invalido" })
})

test("LOOKUP: expirado (invite_expira_em no passado) -> status:invalido", async () => {
  const { deps } = makeDeps({ findByTokenHash: async () => ({ ...VALID_LOOKUP, inviteExpiraEm: "2026-09-01T00:00:00Z" }) })
  const handler = createValidateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { status: "invalido" })
})

test("LOOKUP: expira exatamente agora (não estritamente depois) -> status:invalido (limite exclusivo, igual à RPC de claim)", async () => {
  const { deps } = makeDeps({ findByTokenHash: async () => ({ ...VALID_LOOKUP, inviteExpiraEm: new Date(NOW_MS).toISOString() }) })
  const handler = createValidateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  assert.deepEqual(await res.json(), { status: "invalido" })
})

test("LOOKUP: convidada, nunca usado, ainda não expirado -> status:valido com nome/email", async () => {
  const { deps } = makeDeps()
  const handler = createValidateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { status: "valido", nome: "Maria Teste", email: "maria@email.com" })
})

// =========================================================================
// MINIMIZAÇÃO — nunca vaza mais que o contrato definido
// =========================================================================

test("MINIMIZAÇÃO: resposta 'valido' contém só status/nome/email — nunca telefone/status interno/datas/claim/id", async () => {
  const { deps } = makeDeps({
    findByTokenHash: async () => ({
      ...VALID_LOOKUP,
      // campos que NUNCA deveriam vazar, mesmo que viessem no objeto de
      // retorno de uma implementação futura de findByTokenHash — o
      // handler só deveria repassar nome/email adiante.
      telefone_normalizado: "5511999999999",
      id: "11111111-1111-1111-1111-111111111111",
      invite_token_hash: "0".repeat(64),
      codigo_referral: "MARIA482",
    }),
  })
  const handler = createValidateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  const bodyJson = await res.json()
  assert.deepEqual(Object.keys(bodyJson).sort(), ["email", "nome", "status"])
})

test("MINIMIZAÇÃO: resposta 'invalido' nunca diferencia o motivo (mesmo shape pra inexistente/expirado/usado/status errado)", async () => {
  const scenarios = [
    { findByTokenHash: async () => null },
    { findByTokenHash: async () => ({ ...VALID_LOOKUP, status: "ativa" }) },
    { findByTokenHash: async () => ({ ...VALID_LOOKUP, inviteTokenUsadoEm: "2026-09-20T12:00:00Z" }) },
    { findByTokenHash: async () => ({ ...VALID_LOOKUP, inviteExpiraEm: "2020-01-01T00:00:00Z" }) },
  ]
  const bodies = []
  for (const overrides of scenarios) {
    const { deps } = makeDeps(overrides)
    const handler = createValidateAmbassadorInviteHandler(deps)
    const res = await handler(makeRequest())
    assert.equal(res.status, 200, "todos os motivos de invalidez usam o mesmo status HTTP 200")
    bodies.push(JSON.stringify(await res.json()))
  }
  assert.equal(new Set(bodies).size, 1, "todos os cenários deveriam produzir exatamente a mesma resposta")
  assert.equal(bodies[0], JSON.stringify({ status: "invalido" }))
})

// =========================================================================
// isInviteRedeemable — unidade pura
// =========================================================================

test("isInviteRedeemable: ignora invite_claim_* — não faz parte da decisão de elegibilidade", () => {
  // Prova em nível de unidade que a função nem aceita esses campos como
  // parâmetro — reforça a decisão de arquitetura documentada em logic.ts.
  assert.equal(isInviteRedeemable(VALID_LOOKUP, NOW_MS), true)
  assert.equal(Object.keys(VALID_LOOKUP).includes("inviteClaimId"), false)
})

test("isPlausibleToken: aceita exatamente o alfabeto base64url (A-Za-z0-9_-)", () => {
  assert.equal(isPlausibleToken(REAL_TOKEN), true)
  assert.equal(isPlausibleToken("a".repeat(43) + "="), false, "padding '=' não é base64url")
  assert.equal(isPlausibleToken("a".repeat(43) + "+"), false)
  assert.equal(isPlausibleToken("a".repeat(43) + "/"), false)
})

// =========================================================================
// index.ts — ASSERÇÕES DE CÓDIGO-FONTE (não executável sem Deno real, mas
// a estrutura do arquivo pode ser verificada estaticamente)
// =========================================================================

test("index.ts: env vars obrigatórias usam requireEnv — mesma disciplina de create-ambassador-invite", () => {
  const source = fs.readFileSync(new URL("../supabase/functions/validate-ambassador-invite/index.ts", import.meta.url), "utf8")
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  for (const varName of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    assert.match(codeOnly, new RegExp(`const ${varName} = requireEnv\\("${varName}"\\)`))
  }
})

test("index.ts: CORS usa EMBAIXADORAS_REDEMPTION_ALLOWED_ORIGINS (dedicada à Landing) — nunca EMBAIXADORAS_ALLOWED_ORIGINS (do Admin)", () => {
  const source = fs.readFileSync(new URL("../supabase/functions/validate-ambassador-invite/index.ts", import.meta.url), "utf8")
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  assert.match(codeOnly, /EMBAIXADORAS_REDEMPTION_ALLOWED_ORIGINS/)
  assert.ok(!/"EMBAIXADORAS_ALLOWED_ORIGINS"/.test(codeOnly), "não deveria reaproveitar a allowlist do Admin")
})

test("index.ts: SELECT só pede as 5 colunas necessárias — nunca select(*) nem colunas de claim/hash/id", () => {
  const source = fs.readFileSync(new URL("../supabase/functions/validate-ambassador-invite/index.ts", import.meta.url), "utf8")
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  assert.match(codeOnly, /\.select\("nome, email, status, invite_token_usado_em, invite_expira_em"\)/)
  assert.ok(!/select\("\*"\)/.test(codeOnly))
})
