import test from "node:test"
import assert from "node:assert/strict"
import { resolveLoginRedirectTarget } from "../apps/admin/src/lib/loginRedirect.ts"

// -----------------------------------------------------------------------
// IMPLEMENTATION-CRM-004B (item 4) — o redirect pós-login precisa preservar
// pathname + search (não só pathname), pra um deep link `?lead=` sobreviver
// ao login. Ver achado no diagnóstico CRM-004A.
// -----------------------------------------------------------------------

test("from ausente -> '/' (sem sessão vinda de nenhum lugar específico)", () => {
  assert.equal(resolveLoginRedirectTarget(undefined), "/")
  assert.equal(resolveLoginRedirectTarget(null), "/")
})

test("from sem pathname -> '/'", () => {
  assert.equal(resolveLoginRedirectTarget({ pathname: null, search: "?lead=abc" }), "/")
  assert.equal(resolveLoginRedirectTarget({}), "/")
})

test("from com pathname e search -> preserva os dois (o bug: antes só pathname sobrevivia)", () => {
  assert.equal(
    resolveLoginRedirectTarget({ pathname: "/crm", search: "?lead=abc123" }),
    "/crm?lead=abc123",
  )
})

test("from com pathname e sem search -> só pathname, sem '?' sobrando", () => {
  assert.equal(resolveLoginRedirectTarget({ pathname: "/leads", search: "" }), "/leads")
  assert.equal(resolveLoginRedirectTarget({ pathname: "/leads", search: null }), "/leads")
})

test("from com múltiplos query params -> preserva a string inteira", () => {
  assert.equal(
    resolveLoginRedirectTarget({ pathname: "/crm", search: "?lead=abc&x=1" }),
    "/crm?lead=abc&x=1",
  )
})
