import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { createRedeemAmbassadorInviteHandler } from "../supabase/functions/redeem-ambassador-invite/handler.ts"
import { isPlausiblePassword, isPlausibleToken, sha256Hex } from "../supabase/functions/redeem-ambassador-invite/logic.ts"

// -----------------------------------------------------------------------
// EMBAIXADORAS TANIA JOIAS V1 — E2.5-B. Testes de `redeem-ambassador-
// invite`, todos com doubles/mocks — NENHUMA conexão real com Supabase,
// NENHUM auth.users real é criado/apagado, NENHUMA linha em embaixadoras é
// escrita de verdade em lugar nenhum. `handler.ts` é chamado diretamente
// (sem Deno.serve, sem cliente Supabase real, sem RPC real).
//
// `makeFakeDb` abaixo reimplementa em memória exatamente as MESMAS
// condições WHERE das 3 RPCs SQL (claim_ambassador_invite/
// finalize_ambassador_invite/release_ambassador_invite_claim, ver
// supabase/migrations/20260916120000_...sql) — isso testa o CONTRATO entre
// handler.ts e as RPCs (o que este arquivo pode verificar sem Postgres
// real), não a instrução SQL em si (essa é revisada/auditada como texto na
// E2.5-C).
// -----------------------------------------------------------------------

const ALLOWED_ORIGIN = "https://taniajoiasmaua.com.br"
const REAL_TOKEN = "a".repeat(43)
const NOW_MS = new Date("2026-09-23T12:00:00Z").getTime()
let realTokenHash

test.before(async () => {
  realTokenHash = await sha256Hex(REAL_TOKEN)
})

function makeFakeEmbaixadora(overrides = {}) {
  return {
    id: "embaixadora-1",
    nome: "Maria Teste",
    email: "maria@email.com",
    status: "convidada",
    invite_token_usado_em: null,
    invite_expira_em: "2026-09-30T12:00:00Z",
    invite_claim_id: null,
    invite_claimed_em: null,
    invite_claim_expira_em: null,
    user_id: null,
    ...overrides,
  }
}

/** Fake em memória com a MESMA semântica das 3 RPCs SQL — ver cabeçalho do arquivo. */
function makeFakeDb(row, { tokenHash = realTokenHash, nowMs = () => NOW_MS } = {}) {
  let state = { ...row }
  let claimCounter = 0
  return {
    getState: () => ({ ...state }),
    claim: async ({ tokenHash: receivedHash, ttlSeconds }) => {
      if (receivedHash !== tokenHash) return null
      if (state.invite_token_usado_em !== null) return null
      if (new Date(state.invite_expira_em).getTime() <= nowMs()) return null
      if (state.status !== "convidada") return null
      const claimAtivo =
        state.invite_claim_id !== null && new Date(state.invite_claim_expira_em).getTime() >= nowMs()
      if (claimAtivo) return null
      claimCounter += 1
      const claimId = `claim-${claimCounter}`
      state = {
        ...state,
        invite_claim_id: claimId,
        invite_claimed_em: new Date(nowMs()).toISOString(),
        invite_claim_expira_em: new Date(nowMs() + ttlSeconds * 1000).toISOString(),
      }
      return { embaixadoraId: state.id, claimId, nome: state.nome, email: state.email }
    },
    finalize: async ({ embaixadoraId, claimId, userId }) => {
      if (state.id !== embaixadoraId) return false
      if (state.invite_claim_id !== claimId) return false
      if (state.invite_token_usado_em !== null) return false
      if (state.status !== "convidada") return false
      state = {
        ...state,
        user_id: userId,
        status: "ativa",
        invite_token_usado_em: new Date(nowMs()).toISOString(),
        invite_claim_id: null,
        invite_claimed_em: null,
        invite_claim_expira_em: null,
      }
      return true
    },
    release: async ({ embaixadoraId, claimId }) => {
      if (state.id !== embaixadoraId) return
      if (state.invite_claim_id !== claimId) return // no-op: nunca libera claim de outra tentativa
      state = { ...state, invite_claim_id: null, invite_claimed_em: null, invite_claim_expira_em: null }
    },
  }
}

function makeDeps(overrides = {}) {
  const row = overrides.row ?? makeFakeEmbaixadora()
  const db = overrides.db ?? makeFakeDb(row)
  const logs = []
  const createdUsers = new Map()
  const deletedUserIds = []
  let userCounter = 0

  const defaultCreateAuthUser = async ({ email, password, nome }) => {
    userCounter += 1
    const userId = `user-${userCounter}`
    createdUsers.set(userId, { email, password, nome })
    return { ok: true, userId }
  }

  const deps = {
    allowedOrigins: [ALLOWED_ORIGIN],
    minPasswordLength: 6,
    claimTtlSeconds: 180,
    claimInvite: (params) => db.claim(params),
    createAuthUser: defaultCreateAuthUser,
    finalizeInvite: (params) => db.finalize(params),
    releaseClaim: (params) => db.release(params),
    deleteAuthUser: async (userId) => {
      deletedUserIds.push(userId)
      createdUsers.delete(userId)
      return true
    },
    logEvent: (fields) => logs.push(fields),
    ...overrides,
  }
  delete deps.row
  delete deps.db
  return { deps, db, logs, createdUsers, deletedUserIds }
}

function makeRequest({
  method = "POST",
  origin = ALLOWED_ORIGIN,
  body = { token: REAL_TOKEN, password: "senha-forte-123" },
} = {}) {
  const headers = new Headers()
  if (origin !== null) headers.set("origin", origin)
  return new Request("https://example.invalid/redeem-ambassador-invite", {
    method,
    headers,
    body:
      method === "OPTIONS" || method === "GET"
        ? undefined
        : body === undefined
          ? undefined
          : typeof body === "string"
            ? body
            : JSON.stringify(body),
  })
}

// =========================================================================
// HTTP / CORS
// =========================================================================

test("HTTP: OPTIONS -> 204 com CORS", async () => {
  const { deps } = makeDeps()
  const handler = createRedeemAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ method: "OPTIONS" }))
  assert.equal(res.status, 204)
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), ALLOWED_ORIGIN)
})

test("HTTP: origem não permitida -> 403, sem CORS permissivo", async () => {
  const { deps, db } = makeDeps()
  const handler = createRedeemAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ origin: "https://site-nao-autorizado.example.com" }))
  assert.equal(res.status, 403)
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), null)
  assert.equal(db.getState().status, "convidada", "não deveria ter tocado o estado")
})

test("HTTP: método inválido (GET) -> 405", async () => {
  const { deps } = makeDeps()
  const handler = createRedeemAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ method: "GET" }))
  assert.equal(res.status, 405)
})

test("HTTP: JSON inválido -> 400 invalid_json", async () => {
  const { deps } = makeDeps()
  const handler = createRedeemAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ body: "{ isso nao é json" }))
  assert.equal(res.status, 400)
  assert.deepEqual(await res.json(), { error: "invalid_json" })
})

// =========================================================================
// SUCESSO COMPLETO
// =========================================================================

test("SUCESSO: token+senha válidos -> claim, cria Auth user, finaliza, responde status:sucesso", async () => {
  const { deps, db, createdUsers, logs } = makeDeps()
  const handler = createRedeemAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { status: "sucesso" })

  const state = db.getState()
  assert.equal(state.status, "ativa")
  assert.equal(state.invite_token_usado_em !== null, true)
  assert.equal(state.invite_claim_id, null, "claim deveria ser limpo na finalização")
  assert.equal(state.user_id, "user-1")

  assert.equal(createdUsers.size, 1)
  const [[userId, user]] = createdUsers
  assert.equal(userId, "user-1")
  assert.equal(user.email, "maria@email.com", "email vem do registro do convite, nunca do browser")
  assert.equal(user.nome, "Maria Teste")

  assert.ok(logs.some((l) => l.event === "redeem_success"))
})

test("SUCESSO: e-mail/nome usados no createAuthUser vêm do claim, nunca de campos extras no body", async () => {
  const { deps, createdUsers } = makeDeps()
  const handler = createRedeemAmbassadorInviteHandler(deps)
  const res = await handler(
    makeRequest({
      body: {
        token: REAL_TOKEN,
        password: "senha-forte-123",
        email: "atacante@evil.com",
        nome: "Nome Falso",
      },
    }),
  )
  assert.equal(res.status, 200)
  const [[, user]] = createdUsers
  assert.equal(user.email, "maria@email.com")
  assert.equal(user.nome, "Maria Teste")
})

// =========================================================================
// FORMATO / VALIDAÇÃO DE ENTRADA
// =========================================================================

test("TOKEN: malformado -> status:invalido, sem tentar claim", async () => {
  const claims = []
  const { deps } = makeDeps({ claimInvite: async (p) => { claims.push(p); return null } })
  const handler = createRedeemAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ body: { token: "curto", password: "senha-forte-123" } }))
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { status: "invalido" })
  assert.equal(claims.length, 0)
})

test("SENHA: mais curta que o mínimo -> 400 senha_invalida, sem tentar claim", async () => {
  const claims = []
  const { deps } = makeDeps({ claimInvite: async (p) => { claims.push(p); return null } })
  const handler = createRedeemAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ body: { token: REAL_TOKEN, password: "123" } }))
  assert.equal(res.status, 400)
  assert.deepEqual(await res.json(), { error: "senha_invalida" })
  assert.equal(claims.length, 0)
})

test("SENHA: no limite mínimo exato -> aceita", async () => {
  const { deps } = makeDeps()
  const handler = createRedeemAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ body: { token: REAL_TOKEN, password: "123456" } }))
  assert.equal(res.status, 200)
})

test("SENHA: absurdamente longa (>128) -> 400 senha_invalida", async () => {
  const { deps } = makeDeps()
  const handler = createRedeemAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest({ body: { token: REAL_TOKEN, password: "x".repeat(129) } }))
  assert.equal(res.status, 400)
  assert.deepEqual(await res.json(), { error: "senha_invalida" })
})

test("SENHA: ausente/não-string -> 400 senha_invalida", async () => {
  const { deps } = makeDeps()
  const handler = createRedeemAmbassadorInviteHandler(deps)
  for (const badPassword of [undefined, null, 12345, {}]) {
    const res = await handler(makeRequest({ body: { token: REAL_TOKEN, password: badPassword } }))
    assert.equal(res.status, 400)
  }
})

// =========================================================================
// CLAIM — token expirado/usado/status errado/inexistente
// =========================================================================

test("CLAIM: token inexistente (hash não bate) -> status:invalido", async () => {
  const { deps } = makeDeps({ row: makeFakeEmbaixadora({ id: "outra" }), db: makeFakeDb(makeFakeEmbaixadora(), { tokenHash: "0".repeat(64) }) })
  const handler = createRedeemAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  assert.deepEqual(await res.json(), { status: "invalido" })
})

test("CLAIM: já usado -> status:invalido, nada é criado/alterado", async () => {
  const row = makeFakeEmbaixadora({ invite_token_usado_em: "2026-09-20T00:00:00Z" })
  const { deps, createdUsers } = makeDeps({ row, db: makeFakeDb(row) })
  const handler = createRedeemAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  assert.deepEqual(await res.json(), { status: "invalido" })
  assert.equal(createdUsers.size, 0)
})

test("CLAIM: expirado -> status:invalido", async () => {
  const row = makeFakeEmbaixadora({ invite_expira_em: "2020-01-01T00:00:00Z" })
  const { deps } = makeDeps({ row, db: makeFakeDb(row) })
  const handler = createRedeemAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  assert.deepEqual(await res.json(), { status: "invalido" })
})

for (const status of ["ativa", "inativa", "rejeitada"]) {
  test(`CLAIM: status '${status}' -> status:invalido (só 'convidada' pode ser resgatada)`, async () => {
    const row = makeFakeEmbaixadora({ status })
    const { deps } = makeDeps({ row, db: makeFakeDb(row) })
    const handler = createRedeemAmbassadorInviteHandler(deps)
    const res = await handler(makeRequest())
    assert.deepEqual(await res.json(), { status: "invalido" })
  })
}

test("CLAIM: erro ao adquirir (RPC lança) -> 500 sanitizado, log minimizado, nunca expõe a mensagem crua", async () => {
  const { deps, logs } = makeDeps({
    claimInvite: async () => {
      throw new Error("connection reset by peer at 10.0.0.5:5432 query=... token=" + REAL_TOKEN)
    },
  })
  const handler = createRedeemAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  assert.equal(res.status, 500)
  const bodyJson = await res.json()
  assert.deepEqual(bodyJson, { error: "nao_foi_possivel_criar_acesso" })
  const everything = JSON.stringify(logs) + JSON.stringify(bodyJson)
  assert.ok(!everything.includes(REAL_TOKEN))
  assert.ok(!everything.includes("10.0.0.5"))
})

// =========================================================================
// CONCORRÊNCIA — claim atômico via fake com a mesma semântica da RPC
// =========================================================================

test("CONCORRÊNCIA: duas tentativas com o mesmo token — só a primeira adquire o claim, a segunda recebe status:invalido", async () => {
  const row = makeFakeEmbaixadora()
  const db = makeFakeDb(row)
  const { deps: depsA } = makeDeps({ row, db })
  const { deps: depsB } = makeDeps({ row, db })
  const handlerA = createRedeemAmbassadorInviteHandler(depsA)
  const handlerB = createRedeemAmbassadorInviteHandler(depsB)

  // Chama claim() diretamente pras duas "tentativas" disputarem a mesma
  // linha antes de qualquer uma delas prosseguir pro createUser — simula a
  // corrida real sem depender de timing de Promise.
  const claimA = await db.claim({ tokenHash: realTokenHash, ttlSeconds: 180 })
  const claimB = await db.claim({ tokenHash: realTokenHash, ttlSeconds: 180 })
  assert.ok(claimA, "primeira tentativa deveria adquirir o claim")
  assert.equal(claimB, null, "segunda tentativa concorrente deveria falhar em adquirir")

  void handlerA
  void handlerB
})

test("CONCORRÊNCIA (via handler): duas chamadas sequenciais ao handler com o mesmo token — primeira sucesso, segunda status:invalido (claim já resolvido/token já usado)", async () => {
  const row = makeFakeEmbaixadora()
  const db = makeFakeDb(row)
  const { deps: depsA } = makeDeps({ row, db })
  const { deps: depsB } = makeDeps({ row, db })
  const handlerA = createRedeemAmbassadorInviteHandler(depsA)
  const handlerB = createRedeemAmbassadorInviteHandler(depsB)

  const resA = await handlerA(makeRequest())
  assert.equal(resA.status, 200)
  assert.deepEqual(await resA.json(), { status: "sucesso" })

  // Duplo submit / segunda aba depois do sucesso: mesmo token, já usado.
  const resB = await handlerB(makeRequest())
  assert.deepEqual(await resB.json(), { status: "invalido" })
})

test("CONCORRÊNCIA: claim expirado naturalmente permite uma NOVA tentativa depois — e o release tardio da tentativa antiga NUNCA libera o claim da nova", async () => {
  let currentMs = NOW_MS
  const row = makeFakeEmbaixadora()
  const db = makeFakeDb(row, { nowMs: () => currentMs })

  // Tentativa A adquire o claim.
  const claimA = await db.claim({ tokenHash: realTokenHash, ttlSeconds: 180 })
  assert.ok(claimA)

  // Passa o TTL da tentativa A (3 min) sem ela nunca finalizar (ex.: aba
  // fechada no meio do fluxo).
  currentMs += 4 * 60 * 1000

  // Tentativa B chega depois, claim de A já expirou -> B consegue adquirir.
  const claimB = await db.claim({ tokenHash: realTokenHash, ttlSeconds: 180 })
  assert.ok(claimB)
  assert.notEqual(claimB.claimId, claimA.claimId)

  // A "tentativa A", atrasada, finalmente tenta liberar o PRÓPRIO claim
  // (ex.: catch tardio de uma requisição que já tinha sido abandonada).
  await db.release({ embaixadoraId: claimA.embaixadoraId, claimId: claimA.claimId })

  // O claim de B tem que sobreviver intacto.
  const state = db.getState()
  assert.equal(state.invite_claim_id, claimB.claimId, "release tardio de A nunca deveria mexer no claim de B")
})

// =========================================================================
// CRIAÇÃO DO AUTH USER — sucesso/falha, metadata mínima
// =========================================================================

test("AUTH createUser: metadata passada pelo handler nunca inclui papel/token/claim/senha — só o que a interface expõe (email/password/nome)", async () => {
  const receivedCalls = []
  const { deps } = makeDeps({
    createAuthUser: async (params) => {
      receivedCalls.push(params)
      return { ok: true, userId: "user-1" }
    },
  })
  const handler = createRedeemAmbassadorInviteHandler(deps)
  await handler(makeRequest())
  assert.equal(receivedCalls.length, 1)
  assert.deepEqual(Object.keys(receivedCalls[0]).sort(), ["email", "nome", "password"])
})

test("AUTH createUser falha (motivo desconhecido) -> claim liberado, resposta genérica, nada finalizado", async () => {
  const row = makeFakeEmbaixadora()
  const db = makeFakeDb(row)
  const { deps, logs } = makeDeps({
    row,
    db,
    createAuthUser: async () => ({ ok: false, reason: "unknown" }),
  })
  const handler = createRedeemAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  assert.equal(res.status, 500)
  assert.deepEqual(await res.json(), { error: "nao_foi_possivel_criar_acesso" })
  const state = db.getState()
  assert.equal(state.invite_claim_id, null, "claim deveria ter sido liberado")
  assert.equal(state.status, "convidada", "nunca deveria ter avançado pra ativa")
  assert.equal(state.invite_token_usado_em, null)
  assert.ok(logs.some((l) => l.reason === "auth_create_failed"))
})

test("AUTH createUser lança exceção (em vez de devolver {ok:false}) -> mesmo tratamento de falha, claim liberado", async () => {
  const row = makeFakeEmbaixadora()
  const db = makeFakeDb(row)
  const { deps } = makeDeps({ row, db, createAuthUser: async () => { throw new Error("network blip") } })
  const handler = createRedeemAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  assert.equal(res.status, 500)
  assert.equal(db.getState().invite_claim_id, null)
})

// =========================================================================
// USUÁRIO AUTH PREEXISTENTE — PONTO CRÍTICO (nunca vincula, nunca apaga)
// =========================================================================

test("EMAIL_EXISTS: createUser falha com email_exists -> NUNCA finaliza, NUNCA vincula, NUNCA apaga nenhum usuário, claim liberado, resposta idêntica a qualquer outra falha genérica", async () => {
  const row = makeFakeEmbaixadora()
  const db = makeFakeDb(row)
  const finalizeCalls = []
  const { deps, logs, deletedUserIds } = makeDeps({
    row,
    db,
    createAuthUser: async () => ({ ok: false, reason: "email_exists" }),
    finalizeInvite: async (p) => {
      finalizeCalls.push(p)
      return db.finalize(p)
    },
  })
  const handler = createRedeemAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())

  assert.equal(res.status, 500)
  assert.deepEqual(await res.json(), { error: "nao_foi_possivel_criar_acesso" }, "resposta pública igual à de qualquer outra falha — nunca revela 'email já existe'")
  assert.equal(finalizeCalls.length, 0, "nunca deveria tentar finalizar/vincular um usuário preexistente")
  assert.equal(deletedUserIds.length, 0, "nunca deveria tentar apagar um usuário que não foi criado nesta execução")
  assert.equal(db.getState().invite_claim_id, null, "claim deveria ser liberado mesmo assim")
  assert.equal(db.getState().status, "convidada")

  const conflictLog = logs.find((l) => l.reason === "auth_email_conflict")
  assert.ok(conflictLog, "deveria registrar um log interno minimizado do conflito, pra tratamento administrativo")
  assert.ok(!("email" in conflictLog), "log de conflito não deveria conter o e-mail")
})

// =========================================================================
// FINALIZAÇÃO — condicionada ao claim correto, falha pós-createUser
// =========================================================================

test("FINALIZAÇÃO: condicionada ao claim_id exato — claim de outra tentativa nunca finaliza por cima", async () => {
  const row = makeFakeEmbaixadora()
  const db = makeFakeDb(row)
  const ok = await db.finalize({ embaixadoraId: row.id, claimId: "claim-que-nao-existe", userId: "user-x" })
  assert.equal(ok, false)
  assert.equal(db.getState().status, "convidada", "não deveria ter alterado nada")
})

test("FALHA PÓS-CREATEUSER: Auth user criado com sucesso mas finalize devolve false -> tenta deleteUser do MESMO userId, depois libera claim, resposta genérica", async () => {
  const row = makeFakeEmbaixadora()
  const db = makeFakeDb(row)
  const { deps, logs, deletedUserIds, createdUsers } = makeDeps({
    row,
    db,
    finalizeInvite: async () => false, // simula claim stale/substituído no exato momento da finalização
  })
  const handler = createRedeemAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())

  assert.equal(res.status, 500)
  assert.deepEqual(await res.json(), { error: "nao_foi_possivel_criar_acesso" })
  assert.deepEqual(deletedUserIds, ["user-1"], "deveria tentar reverter exatamente o usuário criado nesta execução")
  assert.equal(createdUsers.size, 0, "usuário revertido não deveria mais 'existir' no fake")
  assert.ok(logs.some((l) => l.reason === "finalize_failed_rolled_back"))
})

test("FALHA PÓS-CREATEUSER: deleteUser também falha -> log de órfão, ainda tenta liberar claim, resposta genérica (nunca trava/lança pro chamador)", async () => {
  const row = makeFakeEmbaixadora()
  const db = makeFakeDb(row)
  const { deps, logs } = makeDeps({
    row,
    db,
    finalizeInvite: async () => false,
    deleteAuthUser: async () => false, // rollback falhou
  })
  const handler = createRedeemAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())

  assert.equal(res.status, 500)
  assert.deepEqual(await res.json(), { error: "nao_foi_possivel_criar_acesso" })
  const orphanLog = logs.find((l) => l.reason === "finalize_failed_orphan_auth_user")
  assert.ok(orphanLog, "deveria registrar explicitamente o cenário de usuário órfão pra tratamento manual")
  assert.equal(orphanLog.userId, "user-1")
  assert.equal(db.getState().invite_claim_id, null, "ainda deveria tentar liberar o claim mesmo com o órfão")
})

test("FALHA PÓS-CREATEUSER: deleteUser lança exceção (em vez de devolver false) -> mesmo tratamento de órfão, nunca propaga a exceção pro chamador", async () => {
  const row = makeFakeEmbaixadora()
  const db = makeFakeDb(row)
  const { deps, logs } = makeDeps({
    row,
    db,
    finalizeInvite: async () => false,
    deleteAuthUser: async () => { throw new Error("gotrue timeout") },
  })
  const handler = createRedeemAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  assert.equal(res.status, 500)
  assert.ok(logs.some((l) => l.reason === "finalize_failed_orphan_auth_user"))
})

test("FINALIZAÇÃO: finalizeInvite lança exceção -> tratado como falha (mesmo caminho de rollback), nunca 500 não-sanitizado", async () => {
  const row = makeFakeEmbaixadora()
  const db = makeFakeDb(row)
  const { deps, deletedUserIds } = makeDeps({ row, db, finalizeInvite: async () => { throw new Error("db down") } })
  const handler = createRedeemAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  assert.equal(res.status, 500)
  assert.deepEqual(await res.json(), { error: "nao_foi_possivel_criar_acesso" })
  assert.deepEqual(deletedUserIds, ["user-1"])
})

// =========================================================================
// RELEASE — best-effort, nunca derruba a resposta
// =========================================================================

test("RELEASE: releaseClaim lança exceção -> handler ainda responde (não propaga), loga a falha de release", async () => {
  const row = makeFakeEmbaixadora()
  const db = makeFakeDb(row)
  const { deps, logs } = makeDeps({
    row,
    db,
    createAuthUser: async () => ({ ok: false, reason: "unknown" }),
    releaseClaim: async () => { throw new Error("release falhou") },
  })
  const handler = createRedeemAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  assert.equal(res.status, 500)
  assert.deepEqual(await res.json(), { error: "nao_foi_possivel_criar_acesso" })
  assert.ok(logs.some((l) => l.reason === "release_failed"))
})

// =========================================================================
// RETRY / IDEMPOTÊNCIA DO BACKEND
// =========================================================================

test("RETRY: nenhuma chamada é repetida automaticamente dentro de uma única invocação do handler (claim/createUser/finalize, cada um exatamente 1x no caminho feliz)", async () => {
  let claimCalls = 0
  let createCalls = 0
  let finalizeCalls = 0
  const row = makeFakeEmbaixadora()
  const db = makeFakeDb(row)
  const { deps } = makeDeps({
    row,
    db,
    claimInvite: async (p) => { claimCalls++; return db.claim(p) },
    createAuthUser: async (p) => { createCalls++; return { ok: true, userId: "user-1" } },
    finalizeInvite: async (p) => { finalizeCalls++; return db.finalize(p) },
  })
  const handler = createRedeemAmbassadorInviteHandler(deps)
  await handler(makeRequest())
  assert.equal(claimCalls, 1)
  assert.equal(createCalls, 1)
  assert.equal(finalizeCalls, 1)
})

// =========================================================================
// SANITIZAÇÃO — senha/token nunca em log ou resposta
// =========================================================================

test("SANITIZAÇÃO: senha nunca aparece em nenhum log, em nenhum cenário (sucesso ou falha)", async () => {
  const password = "senha-super-secreta-999"
  for (const scenario of [
    {},
    { createAuthUser: async () => ({ ok: false, reason: "unknown" }) },
    { finalizeInvite: async () => false },
  ]) {
    const row = makeFakeEmbaixadora()
    const db = makeFakeDb(row)
    const { deps, logs } = makeDeps({ row, db, ...scenario })
    const handler = createRedeemAmbassadorInviteHandler(deps)
    await handler(makeRequest({ body: { token: REAL_TOKEN, password } }))
    assert.ok(!JSON.stringify(logs).includes(password), "senha não deveria aparecer em nenhum log")
  }
})

test("SANITIZAÇÃO: token bruto nunca aparece em nenhum log", async () => {
  const { deps, logs } = makeDeps()
  const handler = createRedeemAmbassadorInviteHandler(deps)
  await handler(makeRequest())
  assert.ok(!JSON.stringify(logs).includes(REAL_TOKEN))
})

test("SANITIZAÇÃO: resposta de erro nunca é o error.message cru de uma exceção interna", async () => {
  const segredoInterno = "duplicate key value SEGREDO_INTERNO_PG constraint xyz"
  const { deps } = makeDeps({ claimInvite: async () => { throw new Error(segredoInterno) } })
  const handler = createRedeemAmbassadorInviteHandler(deps)
  const res = await handler(makeRequest())
  const bodyJson = await res.json()
  assert.ok(!JSON.stringify(bodyJson).includes("SEGREDO_INTERNO_PG"))
})

// =========================================================================
// logic.ts — unidades puras
// =========================================================================

test("isPlausibleToken/isPlausiblePassword: unidades básicas", () => {
  assert.equal(isPlausibleToken(REAL_TOKEN), true)
  assert.equal(isPlausibleToken(""), false)
  assert.equal(isPlausiblePassword("123456", 6), true)
  assert.equal(isPlausiblePassword("12345", 6), false)
  assert.equal(isPlausiblePassword(123456, 6), false, "número não é string")
})

// =========================================================================
// index.ts — ASSERÇÕES DE CÓDIGO-FONTE
// =========================================================================

test("index.ts: env vars obrigatórias usam requireEnv", () => {
  const source = fs.readFileSync(new URL("../supabase/functions/redeem-ambassador-invite/index.ts", import.meta.url), "utf8")
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  for (const varName of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    assert.match(codeOnly, new RegExp(`const ${varName} = requireEnv\\("${varName}"\\)`))
  }
})

test("index.ts: CORS usa EMBAIXADORAS_REDEMPTION_ALLOWED_ORIGINS — nunca EMBAIXADORAS_ALLOWED_ORIGINS (allowlist do Admin)", () => {
  const source = fs.readFileSync(new URL("../supabase/functions/redeem-ambassador-invite/index.ts", import.meta.url), "utf8")
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  assert.match(codeOnly, /EMBAIXADORAS_REDEMPTION_ALLOWED_ORIGINS/)
  assert.ok(!/"EMBAIXADORAS_ALLOWED_ORIGINS"/.test(codeOnly))
})

test("index.ts: createUser usa email_confirm:true e user_metadata só com 'nome' — nunca papel/telefone/token/claim/password", () => {
  const source = fs.readFileSync(new URL("../supabase/functions/redeem-ambassador-invite/index.ts", import.meta.url), "utf8")
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  assert.match(codeOnly, /email_confirm:\s*true/)
  assert.match(codeOnly, /user_metadata:\s*\{\s*nome\s*\}/)
  for (const forbidden of ["papel", "telefone", "codigo_referral", "claimId", "claim_id"]) {
    assert.ok(!new RegExp(`user_metadata[\\s\\S]{0,80}${forbidden}`).test(codeOnly), `user_metadata não deveria mencionar '${forbidden}'`)
  }
})

test("index.ts: nunca faz UPDATE/INSERT direto em embaixadoras — só via as 3 RPCs (claim/finalize/release)", () => {
  const source = fs.readFileSync(new URL("../supabase/functions/redeem-ambassador-invite/index.ts", import.meta.url), "utf8")
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  assert.ok(!/\.from\("embaixadoras"\)/.test(codeOnly), "redeem não deveria tocar a tabela diretamente — só via RPC")
  for (const rpcName of ["claim_ambassador_invite", "finalize_ambassador_invite", "release_ambassador_invite_claim"]) {
    assert.match(codeOnly, new RegExp(`"${rpcName}"`))
  }
})

// =========================================================================
// migration SQL — verificação semântica do contrato (texto, não execução)
// =========================================================================

test("migration: as 3 RPCs revogam EXECUTE de public/anon/authenticated e concedem só a service_role", () => {
  const source = fs.readFileSync(
    new URL("../supabase/migrations/20260916120000_add_embaixadoras_redemption_claim_rpc.sql", import.meta.url),
    "utf8",
  )
  for (const fn of [
    "claim_ambassador_invite(text, integer)",
    "finalize_ambassador_invite(uuid, uuid, uuid)",
    "release_ambassador_invite_claim(uuid, uuid)",
  ]) {
    assert.match(source, new RegExp(`revoke all on function public\\.${fn.replace(/[().]/g, "\\$&")} from public, anon, authenticated;`))
    assert.match(source, new RegExp(`grant execute on function public\\.${fn.replace(/[().]/g, "\\$&")} to service_role;`))
  }
})

test("migration: claim_ambassador_invite exige status='convidada', não usado, não expirado, e nenhum claim ativo concorrente", () => {
  const source = fs.readFileSync(
    new URL("../supabase/migrations/20260916120000_add_embaixadoras_redemption_claim_rpc.sql", import.meta.url),
    "utf8",
  )
  const claimFn = source.split("finalize_ambassador_invite")[0]
  assert.match(claimFn, /invite_token_usado_em is null/)
  assert.match(claimFn, /invite_expira_em > now\(\)/)
  assert.match(claimFn, /status = 'convidada'/)
  assert.match(claimFn, /invite_claimed_em is null or invite_claim_expira_em < now\(\)/)
})

test("migration: finalize/release exigem invite_claim_id = p_claim_id (nunca finalizam/liberam claim de outra tentativa)", () => {
  const source = fs.readFileSync(
    new URL("../supabase/migrations/20260916120000_add_embaixadoras_redemption_claim_rpc.sql", import.meta.url),
    "utf8",
  )
  const occurrences = source.match(/invite_claim_id = p_claim_id/g) ?? []
  assert.equal(occurrences.length, 2, "finalize e release deveriam ter cada um exatamente uma condição invite_claim_id = p_claim_id")
})

test("migration: nenhuma das 3 funções é SECURITY INVOKER — todas SECURITY DEFINER com search_path fixo", () => {
  const source = fs.readFileSync(
    new URL("../supabase/migrations/20260916120000_add_embaixadoras_redemption_claim_rpc.sql", import.meta.url),
    "utf8",
  )
  const definerCount = (source.match(/security definer/g) ?? []).length
  const searchPathCount = (source.match(/set search_path = public/g) ?? []).length
  assert.equal(definerCount, 3)
  assert.equal(searchPathCount, 3)
})
