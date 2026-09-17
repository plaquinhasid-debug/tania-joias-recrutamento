import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { createGetMyEmbaixadoraHandler } from "../supabase/functions/get-my-embaixadora/handler.ts"
import { isPortalEligible, projectMinhaEmbaixadora } from "../supabase/functions/get-my-embaixadora/logic.ts"

// -----------------------------------------------------------------------
// EMBAIXADORAS TANIA JOIAS V1 — E2.7-B. Testes da Edge Function
// `get-my-embaixadora`, todos com doubles/mocks — NENHUMA conexão real com
// Supabase, NENHUMA leitura real do banco. `handler.ts` é chamado
// diretamente (sem `Deno.serve`, sem cliente Supabase real). Mesmo padrão
// de list-ambassadors-admin.test.mjs/resend-ambassador-invite.test.mjs.
// -----------------------------------------------------------------------

const ALLOWED_ORIGIN = "https://recrutamento.taniajoiasmaua.com.br"
const CAROL_UID = "d01bf21a-0000-0000-0000-000000000001"
const OUTRA_EMBAIXADORA_UID = "b2222222-0000-0000-0000-000000000002"
const EQUIPE_UID = "11111111-1111-1111-1111-111111111111"

const CAROL_ROW = { nome: "Carol", status: "ativa", codigo_referral: "7E9NH4VD" }
const OUTRA_ROW = { nome: "Outra Embaixadora", status: "ativa", codigo_referral: "ZZZZ9999" }

async function realisticAuthorize(header) {
  if (header === "Bearer carol-valida") return { authorized: true, uid: CAROL_UID }
  if (header === "Bearer outra-valida") return { authorized: true, uid: OUTRA_EMBAIXADORA_UID }
  if (header === "Bearer equipe-valida") return { authorized: true, uid: EQUIPE_UID }
  return { authorized: false, status: 401 }
}

/** Simula o banco: só devolve linha pro uid exato que tem uma Embaixadora vinculada. */
function makeDbLookup(rowsByUid) {
  return async (uid) => rowsByUid[uid] ?? null
}

/** Simula profiles.papel: só EQUIPE_UID é 'equipe' por padrão nos testes. */
function makeIsEquipeLookup(equipeUids) {
  return async (uid) => equipeUids.includes(uid)
}

function makeDeps(overrides = {}) {
  const logs = []
  const findCalls = []
  const equipeCalls = []
  const deps = {
    allowedOrigins: [ALLOWED_ORIGIN],
    authorize: realisticAuthorize,
    checkIsEquipe: makeIsEquipeLookup([EQUIPE_UID]),
    findMinhaEmbaixadora: makeDbLookup({ [CAROL_UID]: CAROL_ROW, [OUTRA_EMBAIXADORA_UID]: OUTRA_ROW }),
    logEvent: (fields) => logs.push(fields),
    ...overrides,
  }
  const wrappedFind = async (uid) => {
    findCalls.push(uid)
    return deps.findMinhaEmbaixadora(uid)
  }
  const wrappedIsEquipe = async (uid) => {
    equipeCalls.push(uid)
    return deps.checkIsEquipe(uid)
  }
  return { deps: { ...deps, findMinhaEmbaixadora: wrappedFind, checkIsEquipe: wrappedIsEquipe }, logs, findCalls, equipeCalls }
}

function makeRequest({ method = "GET", origin = ALLOWED_ORIGIN, authorization = "Bearer carol-valida", body } = {}) {
  const headers = new Headers()
  if (origin !== null) headers.set("origin", origin)
  if (authorization !== null) headers.set("authorization", authorization)
  return new Request("https://example.invalid/get-my-embaixadora", {
    method,
    headers,
    body: method === "OPTIONS" || method === "GET" ? undefined : body,
  })
}

// =========================================================================
// JWT ausente/inválido -> bloqueado
// =========================================================================

test("AUTH: sem Authorization -> 401", async () => {
  const { deps } = makeDeps()
  const handler = createGetMyEmbaixadoraHandler(deps)
  const res = await handler(makeRequest({ authorization: null }))
  assert.equal(res.status, 401)
  assert.deepEqual(await res.json(), { error: "unauthorized" })
})

test("AUTH: JWT inválido/lixo -> 401", async () => {
  const { deps } = makeDeps()
  const handler = createGetMyEmbaixadoraHandler(deps)
  const res = await handler(makeRequest({ authorization: "Bearer lixo-invalido" }))
  assert.equal(res.status, 401)
  assert.deepEqual(await res.json(), { error: "unauthorized" })
})

test("AUTH: 401 acontece ANTES de qualquer consulta ao banco (nem is_equipe, nem embaixadoras)", async () => {
  const { deps, findCalls, equipeCalls } = makeDeps()
  const handler = createGetMyEmbaixadoraHandler(deps)
  await handler(makeRequest({ authorization: null }))
  assert.equal(equipeCalls.length, 0, "checkIsEquipe não deveria ser chamada sem autorização")
  assert.equal(findCalls.length, 0, "findMinhaEmbaixadora não deveria ser chamada sem autorização")
})

// =========================================================================
// Equipe não obtém dados de Embaixadora por fallback (E2.7-B) — e agora
// (E2.7-C) NEM MESMO se existir uma linha ativa vinculada ao seu uid.
// =========================================================================

test("EQUIPE: uid de equipe sem linha em embaixadoras -> 404, nunca 200 (sem fallback)", async () => {
  const { deps } = makeDeps()
  const handler = createGetMyEmbaixadoraHandler(deps)
  const res = await handler(makeRequest({ authorization: "Bearer equipe-valida" }))
  assert.equal(res.status, 404)
  assert.deepEqual(await res.json(), { error: "embaixadora_nao_encontrada" })
})

test("EQUIPE: checkIsEquipe é chamada com o uid exato da equipe ANTES de qualquer consulta a embaixadoras, e findMinhaEmbaixadora NUNCA é chamada quando checkIsEquipe=true", async () => {
  const { deps, findCalls, equipeCalls } = makeDeps()
  const handler = createGetMyEmbaixadoraHandler(deps)
  await handler(makeRequest({ authorization: "Bearer equipe-valida" }))
  assert.deepEqual(equipeCalls, [EQUIPE_UID])
  assert.equal(findCalls.length, 0, "equipe=true deveria negar sem sequer consultar embaixadoras")
})

// =========================================================================
// E2.7-C — CENÁRIO ADVERSARIAL: mesmo uid é simultaneamente equipe E tem
// uma linha ativa vinculada em embaixadoras (inconsistência futura,
// hipotética — hoje não é criada por nenhum fluxo real, mas o handler
// nunca deve confiar nisso). Portal precisa ser NEGADO mesmo assim.
// =========================================================================

test("ADVERSARIAL: uid com papel='equipe' E embaixadoras.status='ativa' vinculada -> 404, NUNCA 200 com os dados", async () => {
  const CONFLICTING_UID = "c0000000-0000-0000-0000-000000000099"
  const { deps, findCalls, equipeCalls } = makeDeps({
    authorize: async (header) => (header === "Bearer conflito-valido" ? { authorized: true, uid: CONFLICTING_UID } : { authorized: false, status: 401 }),
    checkIsEquipe: makeIsEquipeLookup([CONFLICTING_UID]),
    findMinhaEmbaixadora: makeDbLookup({ [CONFLICTING_UID]: { nome: "Conflito", status: "ativa", codigo_referral: "CONFLITO1" } }),
  })
  const handler = createGetMyEmbaixadoraHandler(deps)
  const res = await handler(makeRequest({ authorization: "Bearer conflito-valido" }))
  assert.equal(res.status, 404)
  assert.deepEqual(await res.json(), { error: "embaixadora_nao_encontrada" })
  assert.deepEqual(equipeCalls, [CONFLICTING_UID], "checkIsEquipe deveria ter sido chamada")
  assert.equal(findCalls.length, 0, "findMinhaEmbaixadora NUNCA deveria ser chamada — equipe nega antes de sequer olhar pra embaixadoras")
  const bodyText = JSON.stringify(await (await handler(makeRequest({ authorization: "Bearer conflito-valido" }))).json())
  assert.ok(!bodyText.includes("Conflito") && !bodyText.includes("CONFLITO1"), "nenhum dado da linha conflitante deveria vazar")
})

test("ADVERSARIAL: erro ao checar checkIsEquipe -> 500 sanitizado, fail-closed (nunca prossegue pra findMinhaEmbaixadora sem saber se é equipe)", async () => {
  const { deps, findCalls } = makeDeps({
    checkIsEquipe: async () => { throw new Error("falha ao consultar profiles") },
  })
  const handler = createGetMyEmbaixadoraHandler(deps)
  const res = await handler(makeRequest({ authorization: "Bearer carol-valida" }))
  assert.equal(res.status, 500)
  assert.deepEqual(await res.json(), { error: "internal_error" })
  assert.equal(findCalls.length, 0, "nunca deveria consultar embaixadoras se não sabemos se é equipe")
})

// =========================================================================
// Embaixadora A nunca consulta Embaixadora B
// =========================================================================

test("ISOLAMENTO: Carol autenticada só pode receber a linha vinculada ao SEU uid — a consulta nunca aceita um id vindo do request", async () => {
  const { deps, findCalls } = makeDeps()
  const handler = createGetMyEmbaixadoraHandler(deps)
  const res = await handler(makeRequest({ authorization: "Bearer carol-valida" }))
  const bodyJson = await res.json()
  assert.equal(bodyJson.nome, "Carol")
  assert.deepEqual(findCalls, [CAROL_UID], "só o uid derivado do JWT da Carol foi usado na consulta")
})

test("ISOLAMENTO: outra Embaixadora autenticada recebe SÓ a própria linha, nunca a da Carol", async () => {
  const { deps } = makeDeps()
  const handler = createGetMyEmbaixadoraHandler(deps)
  const res = await handler(makeRequest({ authorization: "Bearer outra-valida" }))
  const bodyJson = await res.json()
  assert.equal(bodyJson.nome, "Outra Embaixadora")
  assert.equal(bodyJson.codigo_referral, "ZZZZ9999")
  assert.notEqual(bodyJson.nome, "Carol")
})

test("ISOLAMENTO: handler nunca lê body/query pra decidir identidade — GET não tem body, e nenhum campo de identidade é lido do request em lugar nenhum", () => {
  const source = fs.readFileSync(new URL("../supabase/functions/get-my-embaixadora/handler.ts", import.meta.url), "utf8")
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  assert.ok(!/req\.json\(\)/.test(codeOnly), "handler não deveria nem tentar ler um body")
  assert.ok(!/searchParams|req\.url/.test(codeOnly), "handler não deveria ler query string")
  assert.match(codeOnly, /findMinhaEmbaixadora\(auth\.uid\)/, "a única fonte de identidade usada na consulta deveria ser auth.uid vindo de authorize()")
})

// =========================================================================
// Embaixadora ativa recebe somente os 3 campos públicos
// =========================================================================

test("SUCESSO: Embaixadora ativa -> 200 com exatamente nome/status/codigo_referral", async () => {
  const { deps } = makeDeps()
  const handler = createGetMyEmbaixadoraHandler(deps)
  const res = await handler(makeRequest({ authorization: "Bearer carol-valida" }))
  assert.equal(res.status, 200)
  const bodyJson = await res.json()
  assert.deepEqual(Object.keys(bodyJson).sort(), ["codigo_referral", "nome", "status"])
  assert.deepEqual(bodyJson, { nome: "Carol", status: "ativa", codigo_referral: "7E9NH4VD" })
})

// =========================================================================
// Embaixadora não ativa é bloqueada
// =========================================================================

for (const status of ["convidada", "inativa", "rejeitada"]) {
  test(`ELEGIBILIDADE: status '${status}' -> 404, mesmo com linha existente`, async () => {
    const { deps } = makeDeps({
      findMinhaEmbaixadora: makeDbLookup({ [CAROL_UID]: { ...CAROL_ROW, status } }),
    })
    const handler = createGetMyEmbaixadoraHandler(deps)
    const res = await handler(makeRequest({ authorization: "Bearer carol-valida" }))
    assert.equal(res.status, 404)
    assert.deepEqual(await res.json(), { error: "embaixadora_nao_encontrada" })
  })
}

test("ELEGIBILIDADE: uid sem nenhuma linha vinculada -> 404, mesma resposta de 'não elegível' (sem diferenciar publicamente o motivo)", async () => {
  const { deps } = makeDeps({ findMinhaEmbaixadora: makeDbLookup({}) })
  const handler = createGetMyEmbaixadoraHandler(deps)
  const resNaoExiste = await handler(makeRequest({ authorization: "Bearer carol-valida" }))
  const { deps: deps2 } = makeDeps({ findMinhaEmbaixadora: makeDbLookup({ [CAROL_UID]: { ...CAROL_ROW, status: "inativa" } }) })
  const handler2 = createGetMyEmbaixadoraHandler(deps2)
  const resNaoElegivel = await handler2(makeRequest({ authorization: "Bearer carol-valida" }))
  assert.equal(resNaoExiste.status, resNaoElegivel.status)
  assert.deepEqual(await resNaoExiste.json(), await resNaoElegivel.json())
})

test("logic: isPortalEligible só é true para 'ativa'", () => {
  assert.equal(isPortalEligible("ativa"), true)
  for (const status of ["convidada", "inativa", "rejeitada"]) {
    assert.equal(isPortalEligible(status), false, `status '${status}' não deveria ser elegível`)
  }
})

// =========================================================================
// Resposta nunca contém campos secretos/administrativos
// =========================================================================

test("PRIVACIDADE: mesmo se findMinhaEmbaixadora devolver campos extras sensíveis, a resposta nunca os inclui (projeção explícita)", async () => {
  const rowComExtras = {
    ...CAROL_ROW,
    invite_token_hash: "0".repeat(64),
    invite_expira_em: "2026-09-24T00:00:00.000Z",
    invite_claim_id: "claim-secreto",
    invite_token_usado_em: "2026-09-17T18:50:14.000Z",
    user_id: CAROL_UID,
    telefone_normalizado: "5511989459188",
    email: "taniajoiasmaua@gmail.com",
    aprovada_por: "aprovada-por-secreto",
  }
  const { deps } = makeDeps({ findMinhaEmbaixadora: makeDbLookup({ [CAROL_UID]: rowComExtras }) })
  const handler = createGetMyEmbaixadoraHandler(deps)
  const res = await handler(makeRequest({ authorization: "Bearer carol-valida" }))
  const bodyText = JSON.stringify(await res.json())
  for (const forbidden of [
    "invite_token_hash", "invite_expira_em", "invite_claim_id", "invite_token_usado_em",
    "user_id", "telefone_normalizado", "email", "aprovada_por",
    "claim-secreto", "5511989459188", "taniajoiasmaua@gmail.com", "aprovada-por-secreto",
  ]) {
    assert.ok(!bodyText.includes(forbidden), `campo/valor sensível "${forbidden}" vazou na resposta`)
  }
})

test("logic: projectMinhaEmbaixadora nunca inclui campos extras do objeto de entrada", () => {
  const rowComExtras = { ...CAROL_ROW, invite_token_hash: "segredo", user_id: "segredo", telefone_normalizado: "segredo" }
  const projected = projectMinhaEmbaixadora(rowComExtras)
  assert.deepEqual(Object.keys(projected).sort(), ["codigo_referral", "nome", "status"])
  assert.ok(!JSON.stringify(projected).includes("segredo"))
})

test("PRIVACIDADE: nenhum log contém nome ou código de indicação", async () => {
  const { deps, logs } = makeDeps()
  const handler = createGetMyEmbaixadoraHandler(deps)
  await handler(makeRequest({ authorization: "Bearer carol-valida" }))
  const logsAsText = JSON.stringify(logs)
  assert.ok(!logsAsText.includes("Carol"))
  assert.ok(!logsAsText.includes("7E9NH4VD"))
})

// =========================================================================
// Nenhuma alteração nas 3 tabelas ao consultar
// =========================================================================

test("SOMENTE LEITURA: index.ts nunca escreve em embaixadoras/indicacoes_embaixadoras/recompensas_embaixadoras", () => {
  const source = fs.readFileSync(new URL("../supabase/functions/get-my-embaixadora/index.ts", import.meta.url), "utf8")
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  for (const writeMethod of [".insert(", ".update(", ".delete(", ".upsert("]) {
    assert.ok(!codeOnly.includes(writeMethod), `index.ts não deveria conter '${writeMethod}' — esta function é somente leitura`)
  }
  assert.ok(!/\.rpc\(/.test(codeOnly), "esta function não deveria chamar nenhuma RPC mutante")
})

test("index.ts: SELECT explícito de colunas — nunca .select(\"*\")", () => {
  const source = fs.readFileSync(new URL("../supabase/functions/get-my-embaixadora/index.ts", import.meta.url), "utf8")
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  assert.ok(!/\.select\(\s*["']\*["']\s*\)/.test(codeOnly))
  assert.match(codeOnly, /\.select\(\s*["']nome, status, codigo_referral["']\s*\)/)
})

test("index.ts (E2.7-C): checa equipe via consulta direta a profiles.papel, NUNCA via RPC is_equipe() (que exigiria SUPABASE_ANON_KEY/client extra nesta function)", () => {
  const source = fs.readFileSync(new URL("../supabase/functions/get-my-embaixadora/index.ts", import.meta.url), "utf8")
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  assert.ok(!/\.rpc\(\s*["']is_equipe["']/.test(codeOnly), "não deveria chamar a RPC is_equipe()")
  assert.match(codeOnly, /checkIsEquipe:\s*async/, "deveria implementar checkIsEquipe")
  assert.match(codeOnly, /\.from\(["']profiles["']\)/, "deveria consultar profiles diretamente")
  assert.match(codeOnly, /papel["']?\s*===\s*["']equipe["']/, "deveria comparar papel==='equipe', mesma condição de is_equipe()")
  assert.doesNotMatch(codeOnly, /SUPABASE_ANON_KEY/, "não deveria precisar da ANON key nesta function")
})

test("index.ts: env vars obrigatórias usam requireEnv", () => {
  const source = fs.readFileSync(new URL("../supabase/functions/get-my-embaixadora/index.ts", import.meta.url), "utf8")
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  for (const varName of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    assert.match(codeOnly, new RegExp(`const ${varName} = requireEnv\\("${varName}"\\)`))
  }
})

// =========================================================================
// HTTP / CORS
// =========================================================================

test("HTTP: OPTIONS -> 204 com CORS", async () => {
  const { deps } = makeDeps()
  const handler = createGetMyEmbaixadoraHandler(deps)
  const res = await handler(makeRequest({ method: "OPTIONS" }))
  assert.equal(res.status, 204)
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), ALLOWED_ORIGIN)
})

test("HTTP: origem não permitida -> 403, sem CORS permissivo", async () => {
  const { deps } = makeDeps()
  const handler = createGetMyEmbaixadoraHandler(deps)
  const res = await handler(makeRequest({ origin: "https://site-nao-autorizado.example.com" }))
  assert.equal(res.status, 403)
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), null)
})

test("HTTP: método inválido (POST) -> 405", async () => {
  const { deps } = makeDeps()
  const handler = createGetMyEmbaixadoraHandler(deps)
  const res = await handler(makeRequest({ method: "POST" }))
  assert.equal(res.status, 405)
})

// =========================================================================
// ERRO INTERNO
// =========================================================================

test("ERRO: findMinhaEmbaixadora rejeita (falha real de banco) -> 500 sanitizado", async () => {
  const { deps, logs } = makeDeps({
    findMinhaEmbaixadora: async () => { throw new Error("connection to postgres failed telefone=5511999998888") },
  })
  const handler = createGetMyEmbaixadoraHandler(deps)
  const res = await handler(makeRequest({ authorization: "Bearer carol-valida" }))
  assert.equal(res.status, 500)
  assert.deepEqual(await res.json(), { error: "internal_error" })
  const logsAsText = JSON.stringify(logs)
  assert.ok(!logsAsText.includes("5511999998888"))
  assert.ok(!logsAsText.includes("connection to postgres"))
})
