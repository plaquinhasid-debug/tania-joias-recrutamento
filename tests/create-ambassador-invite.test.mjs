import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { createCreateAmbassadorInviteHandler } from "../supabase/functions/create-ambassador-invite/handler.ts"
import {
  CODIGO_REFERRAL_ALPHABET,
  CODIGO_REFERRAL_LENGTH,
  CODIGO_REFERRAL_MAX_ATTEMPTS,
  normalizeAndValidateEmail,
  sha256Hex,
} from "../supabase/functions/create-ambassador-invite/logic.ts"

// -----------------------------------------------------------------------
// EMBAIXADORAS TANIA JOIAS V1 — E2.2-C1. Testes da Edge Function
// `create-ambassador-invite`, todos com doubles/mocks — NENHUMA conexão
// real com Supabase, NENHUM auth.users, NENHUMA linha em embaixadoras é
// criada em lugar nenhum. `handler.ts` é chamado diretamente (sem
// `Deno.serve`, sem cliente Supabase real).
// -----------------------------------------------------------------------

const ALLOWED_ORIGIN = "https://recrutamento.taniajoiasmaua.com.br"
const INVITE_BASE_URL = "https://taniajoiasmaua.com.br/embaixadoras/convite"
const EQUIPE_UID = "11111111-1111-1111-1111-111111111111"

const VALID_BODY = {
  nome: "Maria Teste",
  telefone: "(11) 99999-9999",
  email: " Maria@Email.COM ",
  instagram: " maria.revende ",
}

/** Gera bytes determinísticos (nunca Math.random), bem abaixo do limiar de rejeição (248) — sem nenhuma tentativa "perdida" por rejection sampling nos testes felizes. */
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

/** Simula o authorize real de index.ts reagindo ao header, sem tocar Supabase de verdade. */
async function realisticAuthorize(header) {
  if (header === "Bearer equipe-valida") return { authorized: true, uid: EQUIPE_UID }
  if (header === "Bearer sem-papel") return { authorized: false, status: 403 }
  return { authorized: false, status: 401 }
}

function makeDeps(overrides = {}) {
  const logs = []
  const insertedRows = []
  let insertImpl =
    overrides.insertEmbaixadora ??
    (async (row) => {
      insertedRows.push(row)
      return { id: "embaixadora-id-1", nome: row.nome, status: "convidada", codigoReferral: row.codigo_referral }
    })

  const deps = {
    allowedOrigins: [ALLOWED_ORIGIN],
    inviteBaseUrl: INVITE_BASE_URL,
    randomBytes: makeRandomBytes(),
    authorize: alwaysEquipeAuthorize,
    findExistingEmbaixadora: async () => null,
    logEvent: (fields) => logs.push(fields),
    ...overrides,
    insertEmbaixadora: async (row) => {
      const result = await insertImpl(row)
      if (!overrides.insertEmbaixadora) return result // já empurrou em insertedRows acima
      insertedRows.push(row)
      return result
    },
  }
  return { deps, logs, insertedRows }
}

function makeRequest({ method = "POST", origin = ALLOWED_ORIGIN, authorization = "Bearer equipe-valida", body = VALID_BODY } = {}) {
  const headers = new Headers()
  if (origin !== null) headers.set("origin", origin)
  if (authorization !== null) headers.set("authorization", authorization)
  return new Request("https://example.invalid/create-ambassador-invite", {
    method,
    headers,
    body: method === "OPTIONS" || method === "GET" ? undefined : body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  })
}

function uniqueViolation(constraint) {
  return { code: "23505", constraint }
}

// =========================================================================
// AUTH
// =========================================================================

test("AUTH: sem Authorization -> 401", async () => {
  const { deps } = makeDeps({ authorize: realisticAuthorize })
  const handler = createCreateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ authorization: null }))
  assert.equal(res.status, 401)
  assert.deepEqual(await res.json(), { error: "unauthorized" })
})

test("AUTH: JWT inválido -> 401", async () => {
  const { deps } = makeDeps({ authorize: realisticAuthorize })
  const handler = createCreateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ authorization: "Bearer lixo-invalido" }))
  assert.equal(res.status, 401)
})

test("AUTH: authenticated sem_papel -> 403", async () => {
  const { deps } = makeDeps({ authorize: realisticAuthorize })
  const handler = createCreateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ authorization: "Bearer sem-papel" }))
  assert.equal(res.status, 403)
  assert.deepEqual(await res.json(), { error: "forbidden" })
})

test("AUTH: equipe -> autorizado (201)", async () => {
  const { deps } = makeDeps({ authorize: realisticAuthorize })
  const handler = createCreateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ authorization: "Bearer equipe-valida" }))
  assert.equal(res.status, 201)
})

// =========================================================================
// PAYLOAD
// =========================================================================

test("PAYLOAD: nome vazio -> 400", async () => {
  const { deps } = makeDeps()
  const handler = createCreateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ body: { ...VALID_BODY, nome: "   " } }))
  assert.equal(res.status, 400)
  assert.deepEqual(await res.json(), { error: "nome_obrigatorio" })
})

test("PAYLOAD: telefone inválido -> 400", async () => {
  const { deps } = makeDeps()
  const handler = createCreateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ body: { ...VALID_BODY, telefone: "123" } }))
  assert.equal(res.status, 400)
  assert.deepEqual(await res.json(), { error: "telefone_invalido" })
})

test("PAYLOAD: email inválido -> 400", async () => {
  const { deps } = makeDeps()
  const handler = createCreateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ body: { ...VALID_BODY, email: "nao-e-email" } }))
  assert.equal(res.status, 400)
  assert.deepEqual(await res.json(), { error: "email_invalido" })
})

test("PAYLOAD: instagram vazio/whitespace -> salvo como null", async () => {
  const { deps, insertedRows } = makeDeps()
  const handler = createCreateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ body: { ...VALID_BODY, instagram: "   " } }))
  assert.equal(res.status, 201)
  assert.equal(insertedRows[0].instagram, null)
})

test("PAYLOAD: instagram ausente -> salvo como null (não obrigatório)", async () => {
  const { deps, insertedRows } = makeDeps()
  const handler = createCreateAmbassadorInviteHandler(deps)
  const { instagram, ...withoutInstagram } = VALID_BODY
  const res = await handler(makeRequest({ body: withoutInstagram }))
  assert.equal(res.status, 201)
  assert.equal(insertedRows[0].instagram, null)
})

test("PAYLOAD: email trim + lowercase", async () => {
  const { deps, insertedRows } = makeDeps()
  const handler = createCreateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ body: { ...VALID_BODY, email: "  Cliente@Email.COM  " } }))
  assert.equal(res.status, 201)
  assert.equal(insertedRows[0].email, "cliente@email.com")
})

test("PAYLOAD: telefone usa a normalização oficial da E0 (não uma reimplementação)", async () => {
  const { deps, insertedRows } = makeDeps()
  const handler = createCreateAmbassadorInviteHandler(deps)
  // Caso específico do bug de DDI já documentado na E0: DDD 55 (RS) sem
  // "+" na frente. Uma reimplementação ingênua ("startsWith('55')?...")
  // devolveria "55988887777" (11 dígitos, errado); a normalização oficial
  // devolve "5555988887777" (13 dígitos, DDI completo).
  const res = await handler(makeRequest({ body: { ...VALID_BODY, telefone: "55 98888-7777" } }))
  assert.equal(res.status, 201)
  assert.equal(insertedRows[0].telefone_normalizado, "5555988887777")
})

test("PAYLOAD: campos extras/proibidos no body são ignorados, nunca influenciam o INSERT", async () => {
  const { deps, insertedRows } = makeDeps()
  const handler = createCreateAmbassadorInviteHandler(deps)
  const adversarialBody = {
    ...VALID_BODY,
    status: "ativa",
    codigo_referral: "HACKED01",
    invite_token_hash: "0".repeat(64),
    invite_expira_em: "2099-01-01",
    user_id: "22222222-2222-2222-2222-222222222222",
    aprovada_em: "2020-01-01",
    aprovada_por: "33333333-3333-3333-3333-333333333333",
    papel: "equipe",
    pix: "12345678900",
    cpf: "12345678900",
  }
  const res = await handler(makeRequest({ body: adversarialBody }))
  assert.equal(res.status, 201)
  const row = insertedRows[0]
  assert.deepEqual(Object.keys(row).sort(), [
    "codigo_referral",
    "email",
    "instagram",
    "invite_token_hash",
    "nome",
    "telefone_normalizado",
  ])
  assert.notEqual(row.codigo_referral, "HACKED01")
  assert.notEqual(row.invite_token_hash, "0".repeat(64))
})

// =========================================================================
// TOKEN
// =========================================================================

test("TOKEN: 32 bytes de entropia são pedidos antes de qualquer codificação", async () => {
  const spy = spyRandomBytes(makeRandomBytes())
  const { deps } = makeDeps({ randomBytes: spy.fn })
  const handler = createCreateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  assert.equal(res.status, 201)
  assert.equal(spy.calls[0], 32, "a primeira chamada a randomBytes deveria pedir exatamente 32 bytes (o token)")
})

test("TOKEN: invite_url usa base64url sem padding", async () => {
  const { deps } = makeDeps()
  const handler = createCreateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  const bodyJson = await res.json()
  const token = bodyJson.invite_url.slice(INVITE_BASE_URL.length + 1)
  assert.match(token, /^[A-Za-z0-9_-]+$/, "token deveria ser base64url puro")
  assert.ok(!token.includes("="), "base64url não deve ter padding")
  assert.ok(!token.includes("+") && !token.includes("/"), "não deveria conter caracteres de base64 padrão")
})

test("TOKEN: hash gravado é exatamente SHA-256 hex do token bruto da invite_url", async () => {
  const { deps, insertedRows } = makeDeps()
  const handler = createCreateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  const bodyJson = await res.json()
  const tokenBruto = bodyJson.invite_url.slice(INVITE_BASE_URL.length + 1)
  const expectedHash = await sha256Hex(tokenBruto)
  assert.equal(insertedRows[0].invite_token_hash, expectedHash)
  assert.match(insertedRows[0].invite_token_hash, /^[0-9a-f]{64}$/)
})

test("TOKEN: INSERT nunca recebe o token bruto, só o hash", async () => {
  const { deps, insertedRows } = makeDeps()
  const handler = createCreateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  const bodyJson = await res.json()
  const tokenBruto = bodyJson.invite_url.slice(INVITE_BASE_URL.length + 1)
  const rowAsText = JSON.stringify(insertedRows[0])
  assert.ok(!rowAsText.includes(tokenBruto), "o token bruto nunca deveria aparecer no row inserido")
})

test("TOKEN: token bruto só aparece em invite_url — nunca no objeto 'embaixadora' da resposta", async () => {
  const { deps } = makeDeps()
  const handler = createCreateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  const bodyJson = await res.json()
  const tokenBruto = bodyJson.invite_url.slice(INVITE_BASE_URL.length + 1)
  const embaixadoraAsText = JSON.stringify(bodyJson.embaixadora)
  assert.ok(!embaixadoraAsText.includes(tokenBruto))
})

test("TOKEN: logger nunca recebe o token bruto nem a invite_url", async () => {
  const { deps, logs } = makeDeps()
  const handler = createCreateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  const bodyJson = await res.json()
  const tokenBruto = bodyJson.invite_url.slice(INVITE_BASE_URL.length + 1)
  const logsAsText = JSON.stringify(logs)
  assert.ok(!logsAsText.includes(tokenBruto), "log não deveria conter o token bruto")
  assert.ok(!logsAsText.includes(bodyJson.invite_url), "log não deveria conter a invite_url")
  assert.ok(!logsAsText.includes("http"), "log não deveria conter nenhum link")
})

// =========================================================================
// REFERRAL
// =========================================================================

test("REFERRAL: codigo_referral tem exatamente 8 caracteres do alfabeto permitido", async () => {
  const { deps, insertedRows } = makeDeps()
  const handler = createCreateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  assert.equal(res.status, 201)
  const codigo = insertedRows[0].codigo_referral
  assert.equal(codigo.length, CODIGO_REFERRAL_LENGTH)
  assert.equal(codigo.length, 8)
  for (const ch of codigo) {
    assert.ok(CODIGO_REFERRAL_ALPHABET.includes(ch), `caractere '${ch}' fora do alfabeto permitido`)
  }
  // Nunca I, L, O, 0, 1 — confirmação redundante e explícita.
  for (const forbidden of ["I", "L", "O", "0", "1"]) {
    assert.ok(!codigo.includes(forbidden))
  }
})

test("REFERRAL: logic.ts nunca CHAMA Math.random (só pode mencioná-lo em comentário explicando o porquê de não usar)", () => {
  const source = fs.readFileSync(
    new URL("../supabase/functions/create-ambassador-invite/logic.ts", import.meta.url),
    "utf8",
  )
  // Remove comentários de bloco (/** ... */, /* ... */) e de linha (// ...)
  // antes de checar — o arquivo MENCIONA "Math.random" num comentário
  // explicando a decisão de não usá-lo, o que é documentação legítima,
  // não uma chamada real.
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  assert.ok(!/Math\.random/.test(codeOnly), "código real (fora de comentários) não deveria chamar Math.random")
})

test("REFERRAL: colisão de codigo_referral -> retry automático com código diferente", async () => {
  let calls = 0
  const seenCodes = []
  const { deps, insertedRows } = makeDeps({
    insertEmbaixadora: async (row) => {
      calls++
      seenCodes.push(row.codigo_referral)
      if (calls <= 2) throw uniqueViolation("embaixadoras_codigo_referral_key")
      return { id: "embaixadora-id-1", nome: row.nome, status: "convidada", codigoReferral: row.codigo_referral }
    },
  })
  const handler = createCreateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  assert.equal(res.status, 201)
  assert.equal(calls, 3)
  assert.equal(new Set(seenCodes).size, 3, "cada tentativa deveria usar um código diferente")
})

test("REFERRAL: máximo de 5 tentativas — depois disso, 500 sanitizado", async () => {
  let calls = 0
  const { deps } = makeDeps({
    insertEmbaixadora: async () => {
      calls++
      throw uniqueViolation("embaixadoras_codigo_referral_key")
    },
  })
  const handler = createCreateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  assert.equal(calls, CODIGO_REFERRAL_MAX_ATTEMPTS)
  assert.equal(calls, 5)
  assert.equal(res.status, 500)
  assert.deepEqual(await res.json(), { error: "internal_error" })
})

// =========================================================================
// DUPLICIDADE
// =========================================================================

test("DUPLICIDADE: findExistingEmbaixadora é chamada com telefone e email normalizados", async () => {
  let receivedParams = null
  const { deps } = makeDeps({
    findExistingEmbaixadora: async (params) => {
      receivedParams = params
      return null
    },
  })
  const handler = createCreateAmbassadorInviteHandler(deps)
  await handler(makeRequest())
  assert.deepEqual(receivedParams, { telefoneNormalizado: "5511999999999", emailNormalizado: "maria@email.com" })
})

for (const status of ["convidada", "ativa", "inativa", "rejeitada"]) {
  test(`DUPLICIDADE: status existente '${status}' -> 409, nenhuma segunda linha criada`, async () => {
    const { deps, insertedRows } = makeDeps({
      findExistingEmbaixadora: async () => ({ status }),
    })
    const handler = createCreateAmbassadorInviteHandler(deps)
    const res = await handler(makeRequest())
    assert.equal(res.status, 409)
    assert.equal(insertedRows.length, 0, "não deveria tentar inserir uma segunda linha")
    const bodyJson = await res.json()
    assert.ok(bodyJson.error.length > 0)
  })
}

// =========================================================================
// RACE (23505 apesar do pré-check)
// =========================================================================

test("RACE: 23505 em telefone_normalizado no INSERT -> 409 telefone_ja_existe", async () => {
  const { deps } = makeDeps({
    insertEmbaixadora: async () => {
      throw uniqueViolation("embaixadoras_telefone_normalizado_key")
    },
  })
  const handler = createCreateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  assert.equal(res.status, 409)
  assert.deepEqual(await res.json(), { error: "telefone_ja_existe" })
})

test("RACE: 23505 em email lower no INSERT -> 409 email_ja_existe", async () => {
  const { deps } = makeDeps({
    insertEmbaixadora: async () => {
      throw uniqueViolation("embaixadoras_email_lower_unique_idx")
    },
  })
  const handler = createCreateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  assert.equal(res.status, 409)
  assert.deepEqual(await res.json(), { error: "email_ja_existe" })
})

test("RACE: 23505 em invite_token_hash (colisão extraordinária) -> 500 sanitizado, sem retry", async () => {
  let calls = 0
  const { deps } = makeDeps({
    insertEmbaixadora: async () => {
      calls++
      throw uniqueViolation("embaixadoras_invite_token_hash_key")
    },
  })
  const handler = createCreateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  assert.equal(calls, 1, "colisão de invite_token_hash não deveria ser reprocessada automaticamente")
  assert.equal(res.status, 500)
  assert.deepEqual(await res.json(), { error: "internal_error" })
})

test("RACE: constraint UNIQUE desconhecida -> 500 sanitizado", async () => {
  const { deps } = makeDeps({
    insertEmbaixadora: async () => {
      throw uniqueViolation("alguma_constraint_nova_desconhecida")
    },
  })
  const handler = createCreateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  assert.equal(res.status, 500)
  assert.deepEqual(await res.json(), { error: "internal_error" })
})

// =========================================================================
// HTTP
// =========================================================================

test("HTTP: OPTIONS -> 204 com CORS", async () => {
  const { deps } = makeDeps()
  const handler = createCreateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ method: "OPTIONS" }))
  assert.equal(res.status, 204)
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), ALLOWED_ORIGIN)
})

test("HTTP: origem não permitida -> 403, sem CORS permissivo", async () => {
  const { deps } = makeDeps()
  const handler = createCreateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ origin: "https://site-nao-autorizado.example.com" }))
  assert.equal(res.status, 403)
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), null)
})

test("HTTP: método inválido (GET) -> 405", async () => {
  const { deps } = makeDeps()
  const handler = createCreateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ method: "GET" }))
  assert.equal(res.status, 405)
})

test("HTTP: JSON inválido -> 400", async () => {
  const { deps } = makeDeps()
  const handler = createCreateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ body: "{ isso nao é json" }))
  assert.equal(res.status, 400)
  assert.deepEqual(await res.json(), { error: "invalid_json" })
})

test("HTTP: erro interno genérico nunca vaza mensagem/stack do Postgres", async () => {
  const { deps } = makeDeps({
    insertEmbaixadora: async () => {
      throw new Error("duplicate key value violates unique constraint on table with sensitive detail telefone=5511999998888")
    },
  })
  const handler = createCreateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  assert.equal(res.status, 500)
  const bodyJson = await res.json()
  assert.deepEqual(bodyJson, { error: "internal_error" })
  assert.ok(!JSON.stringify(bodyJson).includes("5511999998888"))
})

// =========================================================================
// PRIVACIDADE (agregado — reconfirma em conjunto o que já foi provado acima)
// =========================================================================

test("PRIVACIDADE: resposta de sucesso nunca contém a chave invite_token_hash", async () => {
  const { deps } = makeDeps()
  const handler = createCreateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  const bodyJson = await res.json()
  assert.ok(!("invite_token_hash" in bodyJson))
  assert.ok(!("invite_token_hash" in bodyJson.embaixadora))
  assert.ok(!JSON.stringify(bodyJson).includes("invite_token_hash"))
})

test("PRIVACIDADE: nenhum log contém o e-mail ou telefone da candidata", async () => {
  const { deps, logs } = makeDeps()
  const handler = createCreateAmbassadorInviteHandler(deps)
  await handler(makeRequest())
  const logsAsText = JSON.stringify(logs)
  assert.ok(!logsAsText.includes("maria@email.com"))
  assert.ok(!logsAsText.includes("5511999999999"))
})

test("PRIVACIDADE: evento de sucesso loga só metadados minimizados (sem payload cru)", async () => {
  const { deps, logs } = makeDeps()
  const handler = createCreateAmbassadorInviteHandler(deps)
  await handler(makeRequest())
  const successLog = logs.find((l) => l.event === "invite_created")
  assert.ok(successLog)
  assert.deepEqual(Object.keys(successLog).sort(), ["actorUid", "embaixadoraId", "event", "success"])
  assert.equal(successLog.actorUid, EQUIPE_UID)
})

// =========================================================================
// E2.2-C1.1 — TESTES ADVERSARIAIS ADICIONAIS (auditoria final antes do
// deploy). Cobrem especificamente os achados da auditoria: header
// Authorization malformado, e-mail com caracteres que quebrariam um
// `.or()` cru do PostgREST, erro de query na checagem de duplicidade
// (antes engolido, agora precisa virar 500 sanitizado), e a normalização
// de barra final de inviteBaseUrl.
// =========================================================================

test("AUTH: handler.ts nunca faz parsing próprio do header Authorization — só repassa pra authorize() e reage ao resultado", async () => {
  // handler.ts não decide sozinho quem é equipe (ver comentário no topo do
  // arquivo); a lógica de "startsWith('Bearer ')"/slice/trim mora só em
  // index.ts:authorize(), que não é testável sem Deno real (ver seção U do
  // relatório). Aqui confirmamos que, pra QUALQUER forma de header
  // (malformado ou não), handler.ts se limita a: (1) passar o valor bruto
  // adiante, (2) devolver exatamente o status que authorize() decidiu.
  const malformedHeaders = [
    "Basic dXNlcjpwYXNz", // esquema errado (Basic, não Bearer)
    "Bearer", // sem espaço, sem token
    "bearer equipe-valida", // "bearer" minúsculo — case-sensitive de propósito
    "BearerSemEspacoequipe-valida", // sem separador
    "Bearer " + " ".repeat(5), // só espaços depois de "Bearer "
  ]
  for (const header of malformedHeaders) {
    const receivedHeaders = []
    const spyAuthorize = async (h) => {
      receivedHeaders.push(h)
      return { authorized: false, status: 401 }
    }
    const { deps } = makeDeps({ authorize: spyAuthorize })
    const handler = createCreateAmbassadorInviteHandler(deps)
    const res = await handler(makeRequest({ authorization: header }))
    assert.equal(res.status, 401, `header "${header}" deveria resultar em 401 (authorize mockado sempre nega)`)
    assert.equal(receivedHeaders.length, 1, `authorize() deveria ter sido chamado exatamente uma vez pro header "${header}"`)
  }
})

test("AUTH: Authorization ausente (null) chega em authorize() como null, não como string vazia", async () => {
  const receivedHeaders = []
  const spyAuthorize = async (h) => {
    receivedHeaders.push(h)
    return { authorized: false, status: 401 }
  }
  const { deps } = makeDeps({ authorize: spyAuthorize })
  const handler = createCreateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ authorization: null }))
  assert.equal(res.status, 401)
  assert.deepEqual(receivedHeaders, [null])
})

test("PAYLOAD/.or(): EMAIL_FORMAT aceita vírgula e parênteses no e-mail — a segurança contra isso é responsabilidade da query em index.ts, não da validação de formato", () => {
  // Documenta o risco real encontrado na auditoria E2.2-C1.1: o regex
  // pragmático de logic.ts (EMAIL_FORMAT) NÃO exclui vírgula/parênteses —
  // caracteres com significado sintático especial no parser de filtros
  // `.or()` do PostgREST. A correção ficou em index.ts (duas queries
  // .eq() isoladas, nunca mais um `.or()` com valor interpolado cru, e
  // nunca `.ilike()` pra email — ver E2.2-C2) — este teste só prova que o
  // valor adversarial realmente passa pela validação de formato e chegaria
  // intacto em findExistingEmbaixadora se a query não fosse segura.
  const adversarial = normalizeAndValidateEmail('cliente","status.eq.ativa),email.ilike."x@teste.com')
  assert.ok(adversarial.valid, "e-mail com vírgula/parênteses/aspas deveria passar no formato pragmático (é esse o risco)")
})

test("PAYLOAD/ILIKE: EMAIL_FORMAT aceita '%' e '_' no e-mail — caracteres-curinga do LIKE/ILIKE", () => {
  // Motivação da microcorreção E2.2-C2: `.ilike()` trataria estes
  // caracteres como wildcards de padrão, não como texto literal. Prova que
  // o formato de e-mail permite ambos, confirmando que o risco existe caso
  // qualquer busca volte a usar ILIKE no futuro.
  assert.ok(normalizeAndValidateEmail("cliente%@teste.com").valid)
  assert.ok(normalizeAndValidateEmail("cli_ente@teste.com").valid)
})

test("DUPLICIDADE: e-mail com '%' e '_' chega intacto (literal) em findExistingEmbaixadora — nunca interpretado como wildcard", async () => {
  let receivedParams = null
  const emailComWildcards = "100%_real@teste.com"
  const { deps } = makeDeps({
    findExistingEmbaixadora: async (params) => {
      receivedParams = params
      return null
    },
  })
  const handler = createCreateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ body: { ...VALID_BODY, email: emailComWildcards } }))
  assert.equal(res.status, 201)
  // handler.ts só normaliza (trim+lowercase) — nunca escapa/reescreve
  // '%'/'_'. A garantia de tratamento literal é responsabilidade de
  // index.ts usar `.eq()` (comparação exata), não `.ilike()` (padrão) —
  // ver comentário em index.ts:findExistingEmbaixadora.
  assert.equal(receivedParams.emailNormalizado, emailComWildcards.toLowerCase())
})

test("index.ts: busca de e-mail usa .eq() exato — nunca .ilike() (que trataria '%'/'_' como wildcard)", () => {
  const source = fs.readFileSync(
    new URL("../supabase/functions/create-ambassador-invite/index.ts", import.meta.url),
    "utf8",
  )
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  assert.match(codeOnly, /\.eq\("email", emailNormalizado\)/, "email deveria ser buscado com .eq() exato")
  assert.ok(!/\.ilike\(/.test(codeOnly), "index.ts não deveria mais usar .ilike() em lugar nenhum (risco de wildcard '%'/'_')")
})

test("DUPLICIDADE: findExistingEmbaixadora recebe o e-mail adversarial intacto (sem sanitização em handler.ts)", async () => {
  let receivedParams = null
  const emailAdversarial = "a,b)@teste.com"
  const { deps } = makeDeps({
    findExistingEmbaixadora: async (params) => {
      receivedParams = params
      return null
    },
  })
  const handler = createCreateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ body: { ...VALID_BODY, email: emailAdversarial } }))
  assert.equal(res.status, 201)
  assert.equal(receivedParams.emailNormalizado, emailAdversarial.toLowerCase())
})

test("DUPLICIDADE: erro na query de checagem (findExistingEmbaixadora rejeita) -> 500 sanitizado, com CORS, sem PII no log", async () => {
  const { deps, logs } = makeDeps({
    findExistingEmbaixadora: async () => {
      throw new Error('failed to parse filter (or=telefone_normalizado.eq.5511999999999,email.eq.maria@email.com,status.eq.ativa))')
    },
  })
  const handler = createCreateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  assert.equal(res.status, 500)
  assert.deepEqual(await res.json(), { error: "internal_error" })
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), ALLOWED_ORIGIN, "mesmo em erro interno, headers de CORS devem estar presentes")
  const logsAsText = JSON.stringify(logs)
  assert.ok(!logsAsText.includes("maria@email.com"))
  assert.ok(!logsAsText.includes("5511999999999"))
  assert.ok(!logsAsText.includes("failed to parse filter"), "log não deveria conter a mensagem de erro crua do Postgrest/Postgres")
})

test("DUPLICIDADE: erro na query de checagem -> nenhuma tentativa de INSERT é feita depois", async () => {
  const { deps, insertedRows } = makeDeps({
    findExistingEmbaixadora: async () => {
      throw new Error("erro de rede simulado")
    },
  })
  const handler = createCreateAmbassadorInviteHandler(deps)
  await handler(makeRequest())
  assert.equal(insertedRows.length, 0)
})

// =========================================================================
// INVITE_URL / BASE URL
// =========================================================================

test("INVITE_URL: inviteBaseUrl com barra final não produz '//' antes do token", async () => {
  const { deps } = makeDeps({ inviteBaseUrl: "https://taniajoiasmaua.com.br/embaixadoras/convite/" })
  const handler = createCreateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  const bodyJson = await res.json()
  assert.ok(!bodyJson.invite_url.includes("convite//"), "não deveria haver barra dupla antes do token")
  assert.match(bodyJson.invite_url, /^https:\/\/taniajoiasmaua\.com\.br\/embaixadoras\/convite\/[A-Za-z0-9_-]+$/)
})

test("INVITE_URL: inviteBaseUrl com múltiplas barras finais também é normalizado", async () => {
  const { deps } = makeDeps({ inviteBaseUrl: "https://taniajoiasmaua.com.br/embaixadoras/convite///" })
  const handler = createCreateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  const bodyJson = await res.json()
  assert.ok(!bodyJson.invite_url.includes("convite//"))
  assert.match(bodyJson.invite_url, /^https:\/\/taniajoiasmaua\.com\.br\/embaixadoras\/convite\/[A-Za-z0-9_-]+$/)
})

test("INVITE_URL: token nunca aparece como query string — sempre como segmento de path", async () => {
  const { deps } = makeDeps()
  const handler = createCreateAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  const bodyJson = await res.json()
  const url = new URL(bodyJson.invite_url)
  assert.equal(url.search, "", "invite_url não deveria ter query string")
  const token = bodyJson.invite_url.slice(INVITE_BASE_URL.length + 1)
  assert.ok(token.length > 0)
})

// =========================================================================
// index.ts — ASSERÇÕES DE CÓDIGO-FONTE (não executável sem Deno real, mas
// a estrutura do arquivo pode ser verificada estaticamente)
// =========================================================================

test("index.ts: env vars obrigatórias usam requireEnv (falha alto em runtime pra ausente/vazio) — não só o operador de tipos '!'", () => {
  const source = fs.readFileSync(
    new URL("../supabase/functions/create-ambassador-invite/index.ts", import.meta.url),
    "utf8",
  )
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  // `!` sozinho (sem passar por requireEnv) não valida nada em runtime —
  // ver auditoria E2.2-C1.1. Confirma que as 4 env vars obrigatórias usam
  // requireEnv(...), não Deno.env.get(...)! direto.
  for (const varName of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "EMBAIXADORAS_INVITE_BASE_URL"]) {
    assert.match(
      codeOnly,
      new RegExp(`const ${varName} = requireEnv\\("${varName}"\\)`),
      `${varName} deveria ser lida via requireEnv(), não Deno.env.get(...)! direto`,
    )
  }
  assert.match(codeOnly, /function requireEnv\(name: string\): string \{/)
  assert.match(codeOnly, /if \(!value \|\| value\.trim\(\)\.length === 0\)/, "requireEnv precisa rejeitar string vazia/só espaço, não só undefined")
})
