import test from "node:test"
import assert from "node:assert/strict"

import { createGetFichaHandler } from "../supabase/functions/get-ficha/handler.ts"

const OFFICIAL_ORIGIN = "https://tania-joias-landing.vercel.app"
const DEV_ORIGIN = "http://localhost:5173"
const ATTACKER_ORIGIN = "https://site-malicioso.example"

function handler(lookupFicha = async () => ({ preenchidoEm: null, primeiroNome: "Maria" }), allowedOrigins = [OFFICIAL_ORIGIN]) {
  return createGetFichaHandler({ allowedOrigins, lookupFicha })
}

const request = (origin, init = {}) => new Request("https://edge.example", { ...init, headers: { origin, ...(init.headers ?? {}) } })

test("origem oficial recebe Access-Control-Allow-Origin e resposta normal", async () => {
  const response = await handler()(request(OFFICIAL_ORIGIN, { method: "POST", body: JSON.stringify({ token: "abc" }) }))
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), OFFICIAL_ORIGIN)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: "pendente", nome: "Maria" })
})

test("origem não autorizada não recebe Access-Control-Allow-Origin e é rejeitada com 403", async () => {
  const response = await handler()(request(ATTACKER_ORIGIN, { method: "POST", body: JSON.stringify({ token: "abc" }) }))
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null)
  assert.equal(response.status, 403)
  assert.deepEqual(await response.json(), { error: "origin_not_allowed" })
})

test("preflight OPTIONS de origem não autorizada não recebe Access-Control-Allow-Origin", async () => {
  const response = await handler()(request(ATTACKER_ORIGIN, { method: "OPTIONS" }))
  assert.equal(response.status, 204)
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null)
})

test("preflight OPTIONS de origem oficial recebe Access-Control-Allow-Origin", async () => {
  const response = await handler()(request(OFFICIAL_ORIGIN, { method: "OPTIONS" }))
  assert.equal(response.status, 204)
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), OFFICIAL_ORIGIN)
})

test("origem de desenvolvimento local funciona quando explicitamente incluída na allowlist", async () => {
  const response = await handler(undefined, [OFFICIAL_ORIGIN, DEV_ORIGIN])(request(DEV_ORIGIN, { method: "POST", body: JSON.stringify({ token: "abc" }) }))
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), DEV_ORIGIN)
  assert.equal(response.status, 200)
})

test("origem de desenvolvimento local NÃO funciona quando não está na allowlist (comportamento fail-closed)", async () => {
  const response = await handler()(request(DEV_ORIGIN, { method: "POST", body: JSON.stringify({ token: "abc" }) }))
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null)
  assert.equal(response.status, 403)
})

test("token inválido continua devolvendo status invalido, não um erro", async () => {
  const response = await handler(async () => null)(request(OFFICIAL_ORIGIN, { method: "POST", body: JSON.stringify({ token: "nao-existe" }) }))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: "invalido" })
})

test("ficha já preenchida continua devolvendo status preenchida, nunca expõe nome de novo", async () => {
  const response = await handler(async () => ({ preenchidoEm: "2026-08-01T00:00:00Z", primeiroNome: "Maria" }))(request(OFFICIAL_ORIGIN, { method: "POST", body: JSON.stringify({ token: "abc" }) }))
  assert.deepEqual(await response.json(), { status: "preenchida" })
})

test("método diferente de POST/OPTIONS é rejeitado", async () => {
  const response = await handler()(request(OFFICIAL_ORIGIN, { method: "GET" }))
  assert.equal(response.status, 405)
})

test("token nunca vaza lead_id nem outro campo além do primeiro nome", async () => {
  const response = await handler(async () => ({ preenchidoEm: null, primeiroNome: "Maria" }))(request(OFFICIAL_ORIGIN, { method: "POST", body: JSON.stringify({ token: "abc" }) }))
  const body = await response.json()
  assert.deepEqual(Object.keys(body).sort(), ["nome", "status"])
})
