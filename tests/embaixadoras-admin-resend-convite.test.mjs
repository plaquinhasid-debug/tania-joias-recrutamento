import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { FunctionsClient, FunctionsHttpError } from "@supabase/functions-js"
import { MutationObserver, QueryClient } from "@tanstack/react-query"

import { resendAmbassadorInvite, createResendInviteMutationOptions } from "../apps/admin/src/hooks/useResendAmbassadorInvite.ts"
import {
  copyInviteLink, createResendSubmissionGuard, initialResendDialogState,
  resendDialogReducer, ResendInviteRequestError, RESEND_UNEXPECTED_ERROR,
} from "../apps/admin/src/lib/ambassadorInvite.ts"

// Apenas doubles de transporte. Nenhuma conexão ou escrita real.
const INPUT = { embaixadoraId: "aaaaaaaa-0000-0000-0000-000000000001", expectedUpdatedAt: "2026-09-17T08:00:00.000Z" }
const RESULT = { invite_url: "https://example.invalid/embaixadoras/convite/SEGREDO_SOMENTE_TESTE", invite_expira_em: "2026-09-24T08:00:00.000Z" }
const successInvoke = async () => ({ data: structuredClone(RESULT), error: null })

function httpInvoke(status, error) {
  return async () => ({
    data: null,
    error: new FunctionsHttpError(new Response(JSON.stringify({ error, message: "DETALHE_INTERNO", stack: "SEGREDO" }), { status })),
  })
}

test("payload: envia só embaixadora_id/expected_updated_at, sem headers manuais, sem nome/telefone/email", async () => {
  const calls = []
  const result = await resendAmbassadorInvite(INPUT, async (...args) => {
    calls.push(args)
    return { data: RESULT, error: null }
  })
  assert.deepEqual(calls, [["resend-ambassador-invite", { method: "POST", body: { embaixadora_id: INPUT.embaixadoraId, expected_updated_at: INPUT.expectedUpdatedAt } }]])
  assert.deepEqual(result, RESULT)
  assert.notEqual(result, RESULT)
})

test("SDK real com fetch simulado: POST recebe 200 e entrega o link somente ao chamador", async () => {
  let calls = 0
  const client = new FunctionsClient("https://example.invalid/functions/v1", {
    customFetch: async (url, init) => {
      calls++
      assert.equal(String(url), "https://example.invalid/functions/v1/resend-ambassador-invite")
      assert.equal(init.method, "POST")
      assert.deepEqual(JSON.parse(init.body), { embaixadora_id: INPUT.embaixadoraId, expected_updated_at: INPUT.expectedUpdatedAt })
      return new Response(JSON.stringify(RESULT), { status: 200, headers: { "Content-Type": "application/json" } })
    },
  })
  assert.deepEqual(await resendAmbassadorInvite(INPUT, client.invoke.bind(client)), RESULT)
  assert.equal(calls, 1)
})

test("sucesso projeta o contrato e descarta campos extras", async () => {
  const result = await resendAmbassadorInvite(INPUT, async () => ({ data: { ...RESULT, internal: "remover" }, error: null }))
  assert.deepEqual(result, RESULT)
})

for (const [status, code, expected] of [
  [400, "expected_updated_at_invalido", "Não foi possível enviar o pedido de reenvio. Atualize a página e tente de novo."],
  [401, "unauthorized", "Sua sessão expirou ou é inválida. Entre novamente para continuar."],
  [403, "forbidden", "Você não tem autorização para reenviar convites neste acesso."],
  [404, "not_found", "Esta Embaixadora não foi encontrada. Atualize a listagem."],
  [409, "nao_convidada", "Este convite não pode mais ser reenviado (a Embaixadora já resgatou, foi desativada ou está em outro estado)."],
  [409, "resgate_em_andamento", "Alguém pode estar finalizando o cadastro agora com o link atual. Tente novamente em alguns minutos."],
  [409, "estado_desatualizado", "A listagem estava desatualizada (outra pessoa já mexeu neste convite). Atualize a página e tente de novo."],
  [500, "internal_error", "Não foi possível reenviar o convite por um erro interno. Tente novamente."],
  [409, "desconhecido", "Não foi possível reenviar este convite agora. Atualize a listagem."],
  [405, "method_not_allowed", RESEND_UNEXPECTED_ERROR],
]) {
  test(`FunctionsHttpError ${status}/${code}: mensagem permitida sem detalhes internos`, async () => {
    await assert.rejects(resendAmbassadorInvite(INPUT, httpInvoke(status, code)), (error) => {
      assert.ok(error instanceof ResendInviteRequestError)
      assert.equal(error.message, expected)
      assert.ok(!error.message.includes("DETALHE_INTERNO"))
      return true
    })
  })
}

test("falhas de rede, rejeições e objetos inesperados nunca expõem mensagem original", async () => {
  for (const error of [new Error(RESULT.invite_url), { message: "SEGREDO" }, "SEGREDO"]) {
    await assert.rejects(resendAmbassadorInvite(INPUT, async () => ({ data: null, error })), { message: RESEND_UNEXPECTED_ERROR })
    await assert.rejects(resendAmbassadorInvite(INPUT, async () => { throw error }), { message: RESEND_UNEXPECTED_ERROR })
  }
})

test("respostas de sucesso malformadas não entram no estado de sucesso", async () => {
  for (const data of [null, {}, { ...RESULT, invite_url: "" }, { invite_url: RESULT.invite_url }, { invite_expira_em: RESULT.invite_expira_em }]) {
    await assert.rejects(resendAmbassadorInvite(INPUT, async () => ({ data, error: null })), { message: RESEND_UNEXPECTED_ERROR })
  }
})

test("React Query real: segredo só chega ao estado efêmero, nunca ao cache de mutation/query; sucesso invalida a listagem", async () => {
  const client = new QueryClient()
  client.setQueryData(["embaixadoras"], [])
  let local = initialResendDialogState()
  const snapshots = []
  const unsubscribe = client.getMutationCache().subscribe(() => {
    snapshots.push(JSON.stringify(client.getMutationCache().getAll().map((entry) => entry.state)))
  })
  const observer = new MutationObserver(client, createResendInviteMutationOptions(client, (result) => {
    local = resendDialogReducer(local, { type: "success", result })
  }, successInvoke))
  try {
    assert.equal(await observer.mutate(INPUT), undefined)
    assert.deepEqual(local.result, RESULT)
    assert.equal(observer.getCurrentResult().data, undefined)
    assert.equal(client.getQueryState(["embaixadoras"]).isInvalidated, true, "listagem deveria ser invalidada (updated_at mudou no banco)")
    for (const snapshot of snapshots) assert.ok(!snapshot.includes("SEGREDO_SOMENTE_TESTE"))
    assert.ok(!JSON.stringify(client.getQueryCache().getAll().map((query) => query.state)).includes("invite_url"))
    local = resendDialogReducer(local, { type: "reset" })
    observer.reset()
    assert.deepEqual(local, initialResendDialogState())
  } finally { unsubscribe(); client.clear() }
})

test("falha da mutation não invalida listagem e não faz retry automático", async () => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: 3 } } })
  client.setQueryData(["embaixadoras"], [])
  let calls = 0
  let delivered = false
  const observer = new MutationObserver(client, createResendInviteMutationOptions(client, () => { delivered = true }, async () => {
    calls++
    return { data: null, error: new Error("SEGREDO") }
  }))
  try {
    await assert.rejects(observer.mutate(INPUT), { message: RESEND_UNEXPECTED_ERROR })
    assert.equal(calls, 1)
    assert.equal(delivered, false)
    assert.equal(client.getQueryState(["embaixadoras"]).isInvalidated, false)
    assert.ok(!JSON.stringify(client.getMutationCache().getAll().map((entry) => entry.state)).includes("SEGREDO"))
  } finally { client.clear() }
})

test("duas submissões simultâneas executam somente uma mutation (mesma trava de createInviteSubmissionGuard)", async () => {
  const guard = createResendSubmissionGuard()
  let release
  let calls = 0
  const blocked = new Promise((resolve) => { release = resolve })
  const task = async () => { calls++; await blocked }
  const first = guard.run(task)
  assert.equal(guard.isPending(), true)
  await guard.run(task)
  assert.equal(calls, 1)
  release()
  await first
  assert.equal(guard.isPending(), false)
  await guard.run(task)
  assert.equal(calls, 2)
})

test("trava é liberada após erro, permitindo nova tentativa explícita", async () => {
  const guard = createResendSubmissionGuard()
  await assert.rejects(guard.run(async () => { throw new Error("falha") }))
  assert.equal(guard.isPending(), false)
  let called = false
  await guard.run(async () => { called = true })
  assert.equal(called, true)
})

test("reset limpa erro e link", () => {
  const populated = { error: "erro", result: structuredClone(RESULT) }
  assert.deepEqual(resendDialogReducer(populated, { type: "reset" }), { error: null, result: null })
})

test("sucesso limpa erro anterior", () => {
  const initial = { error: "erro", result: null }
  const success = resendDialogReducer(initial, { type: "success", result: RESULT })
  assert.equal(success.error, null)
  assert.equal(success.result, RESULT)
})

test("clipboard: aguarda sucesso e entrega só o link ao clipboard (reaproveita copyInviteLink já testado em embaixadoras-admin-convite)", async () => {
  const writes = []
  assert.equal(await copyInviteLink(RESULT.invite_url, async (value) => { writes.push(value) }), true)
  assert.deepEqual(writes, [RESULT.invite_url])
})

test("segurança estática: sem credenciais manuais, armazenamento, navegação ou logs no código novo", () => {
  for (const path of [
    "../apps/admin/src/hooks/useResendAmbassadorInvite.ts",
    "../apps/admin/src/components/embaixadoras/ReenviarConviteDialog.tsx",
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8")
    assert.doesNotMatch(source, /service_role|SUPABASE_SERVICE_ROLE_KEY|Authorization|access_token|refresh_token|localStorage|sessionStorage|console\.(log|error)|setQueryData|useNavigate|window\.location|href=/)
  }
  const dialog = readFileSync(new URL("../apps/admin/src/components/embaixadoras/ReenviarConviteDialog.tsx", import.meta.url), "utf8")
  assert.match(dialog, /toast\.success\("Link copiado"\)/)
  assert.doesNotMatch(dialog, /toast\.[a-z]+\([^\n]*invite_url/)
})

test("EmbaixadorasTable: renderiza ReenviarConviteDialog em coluna de Ações", () => {
  const source = readFileSync(new URL("../apps/admin/src/components/embaixadoras/EmbaixadorasTable.tsx", import.meta.url), "utf8")
  assert.match(source, /import { ReenviarConviteDialog } from ["']@\/components\/embaixadoras\/ReenviarConviteDialog["']/)
  assert.match(source, /<ReenviarConviteDialog embaixadora={info\.row\.original} \/>/)
})

test("ReenviarConviteDialog: só renderiza o gatilho quando status==='convidada' (reforço de UI da regra que já é real no banco)", () => {
  const source = readFileSync(new URL("../apps/admin/src/components/embaixadoras/ReenviarConviteDialog.tsx", import.meta.url), "utf8")
  assert.match(source, /if \(embaixadora\.status !== "convidada"\) return null/)
})

test("useEmbaixadoras: EmbaixadoraAdmin inclui updated_at (necessário para expected_updated_at)", () => {
  const source = readFileSync(new URL("../apps/admin/src/hooks/useEmbaixadoras.ts", import.meta.url), "utf8")
  assert.match(source, /updated_at: string/)
})
