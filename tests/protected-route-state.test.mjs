import test from "node:test"
import assert from "node:assert/strict"

import { resolveProtectedRouteState } from "../apps/admin/src/lib/protectedRouteState.ts"

// -----------------------------------------------------------------------
// IMPLEMENTATION-EMBAIXADORAS-E2.2-D.0-B — testa só a função pura de
// decisão de estado do ProtectedRoute (sem montar React/DOM, mesmo padrão
// de login-redirect.test.mjs). A integração real com useAuth()/useIsEquipe()
// vive em ProtectedRoute.tsx e não é testável neste repo sem introduzir
// tooling de render de componente (não existe hoje — ver auditoria
// E2.2-D.0-A, seção K).
// -----------------------------------------------------------------------

/** Estado "feliz" completo — cada teste sobrescreve só o campo que importa. */
function baseInput(overrides = {}) {
  return {
    sessionLoading: false,
    hasSession: true,
    isEquipeLoading: false,
    isEquipeError: null,
    isEquipe: true,
    ...overrides,
  }
}

test("sessão carregando -> session-loading (independente de qualquer outro campo)", () => {
  assert.equal(
    resolveProtectedRouteState(baseInput({ sessionLoading: true, hasSession: false, isEquipe: undefined })),
    "session-loading",
  )
  // mesmo com isEquipe já resolvido, sessionLoading ainda manda
  assert.equal(
    resolveProtectedRouteState(baseInput({ sessionLoading: true, isEquipe: true })),
    "session-loading",
  )
})

test("sem sessão -> unauthenticated", () => {
  assert.equal(
    resolveProtectedRouteState(baseInput({ hasSession: false, isEquipe: undefined, isEquipeLoading: false })),
    "unauthenticated",
  )
})

test("sessão + autorização carregando (sem erro) -> authorization-loading", () => {
  assert.equal(
    resolveProtectedRouteState(baseInput({ isEquipeLoading: true, isEquipe: undefined })),
    "authorization-loading",
  )
})

test("sessão + erro na autorização -> authorization-error", () => {
  assert.equal(
    resolveProtectedRouteState(baseInput({ isEquipeError: new Error("network"), isEquipe: undefined })),
    "authorization-error",
  )
})

test("sessão + isEquipe=false -> forbidden", () => {
  assert.equal(resolveProtectedRouteState(baseInput({ isEquipe: false })), "forbidden")
})

test("sessão + isEquipe=true -> authorized", () => {
  assert.equal(resolveProtectedRouteState(baseInput({ isEquipe: true })), "authorized")
})

test("combinação impossível: erro presente E isEquipe=false ao mesmo tempo -> erro manda (authorization-error), nunca forbidden nem authorized", () => {
  assert.equal(
    resolveProtectedRouteState(baseInput({ isEquipeError: new Error("boom"), isEquipe: false })),
    "authorization-error",
  )
})

test("combinação impossível: erro presente E isEquipe=true ao mesmo tempo -> erro ainda manda, NUNCA authorized", () => {
  assert.equal(
    resolveProtectedRouteState(baseInput({ isEquipeError: new Error("boom"), isEquipe: true })),
    "authorization-error",
  )
})

test("estado indeterminado (isEquipe=undefined, sem loading, sem erro) -> NUNCA authorized, cai em authorization-loading", () => {
  const result = resolveProtectedRouteState(
    baseInput({ isEquipeLoading: false, isEquipeError: null, isEquipe: undefined }),
  )
  assert.notEqual(result, "authorized")
  assert.equal(result, "authorization-loading")
})

test("fail-closed exaustivo: para NENHUMA combinação de campos o resultado é 'authorized' a menos que isEquipe seja estritamente true, sem erro, sem loading, com sessão, sem sessionLoading", () => {
  const boolValues = [true, false]
  const isEquipeValues = [true, false, undefined]
  const errorValues = [null, undefined, new Error("x")]

  for (const sessionLoading of boolValues) {
    for (const hasSession of boolValues) {
      for (const isEquipeLoading of boolValues) {
        for (const isEquipeError of errorValues) {
          for (const isEquipe of isEquipeValues) {
            const result = resolveProtectedRouteState({
              sessionLoading,
              hasSession,
              isEquipeLoading,
              isEquipeError,
              isEquipe,
            })
            const shouldBeAuthorized =
              !sessionLoading && hasSession && !isEquipeLoading && !isEquipeError && isEquipe === true
            if (result === "authorized") {
              assert.ok(
                shouldBeAuthorized,
                `authorized indevido para: ${JSON.stringify({ sessionLoading, hasSession, isEquipeLoading, isEquipeError: !!isEquipeError, isEquipe })}`,
              )
            }
          }
        }
      }
    }
  }
})

test("loading nunca aparece junto com authorized ou forbidden no mesmo resultado (são estados mutuamente exclusivos)", () => {
  const states = new Set([
    resolveProtectedRouteState(baseInput({ sessionLoading: true })),
    resolveProtectedRouteState(baseInput({ hasSession: false })),
    resolveProtectedRouteState(baseInput({ isEquipeLoading: true, isEquipe: undefined })),
    resolveProtectedRouteState(baseInput({ isEquipeError: new Error("x"), isEquipe: undefined })),
    resolveProtectedRouteState(baseInput({ isEquipe: false })),
    resolveProtectedRouteState(baseInput({ isEquipe: true })),
  ])
  assert.deepEqual(
    [...states].sort(),
    [
      "authorization-error",
      "authorization-loading",
      "authorized",
      "forbidden",
      "session-loading",
      "unauthenticated",
    ].sort(),
  )
})
