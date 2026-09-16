import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { FunctionsClient, FunctionsHttpError } from "@supabase/functions-js"
import { MutationObserver, QueryClient } from "@tanstack/react-query"

import { createAmbassadorInvite, createInviteMutationOptions } from "../apps/admin/src/hooks/useCreateAmbassadorInvite.ts"
import {
  copyInviteLink, createInviteSubmissionGuard, initialInviteDialogState,
  inviteDialogReducer, InviteRequestError, INVITE_UNEXPECTED_ERROR, validateInviteFields,
} from "../apps/admin/src/lib/ambassadorInvite.ts"

// Apenas doubles de transporte. Nenhuma conexão ou escrita real.
const INPUT = { nome: " Maria Teste ", telefone: "55 98888-7777", email: "Maria@EXAMPLE.com", instagram: " @Maria.teste_1 " }
const RESULT = {
  embaixadora: { id: "id-teste", nome: "Maria Teste", status: "convidada", codigo_referral: "ABCD2345" },
  invite_url: "https://example.invalid/embaixadoras/convite/SEGREDO_SOMENTE_TESTE",
}
const successInvoke = async () => ({ data: structuredClone(RESULT), error: null })

function httpInvoke(status, error) {
  return async () => ({
    data: null,
    error: new FunctionsHttpError(new Response(JSON.stringify({ error, message: "DETALHE_INTERNO", stack: "SEGREDO" }), { status })),
  })
}

test("payload: quatro campos explícitos, telefone e Instagram digitados preservados; sem headers manuais", async () => {
  const calls = []
  const result = await createAmbassadorInvite({ ...INPUT, papel: "equipe", invite_url: "NAO_ENVIAR" }, async (...args) => {
    calls.push(args)
    return { data: RESULT, error: null }
  })
  assert.deepEqual(calls, [["create-ambassador-invite", { method: "POST", body: INPUT }]])
  assert.deepEqual(result, RESULT)
  assert.notEqual(result, RESULT)
})

test("Instagram ausente é omitido; vazio é aceito sem normalização concorrente", async () => {
  for (const instagram of [undefined, ""]) {
    let sent
    await createAmbassadorInvite({ ...INPUT, instagram }, async (_name, options) => {
      sent = options.body
      return { data: RESULT, error: null }
    })
    assert.equal(Object.hasOwn(sent, "instagram"), instagram !== undefined)
    assert.equal(sent.instagram, instagram)
  }
})

test("SDK real com fetch simulado: POST recebe 201 e entrega o link somente ao chamador", async () => {
  let calls = 0
  const client = new FunctionsClient("https://example.invalid/functions/v1", {
    customFetch: async (url, init) => {
      calls++
      assert.equal(String(url), "https://example.invalid/functions/v1/create-ambassador-invite")
      assert.equal(init.method, "POST")
      assert.deepEqual(JSON.parse(init.body), INPUT)
      return new Response(JSON.stringify(RESULT), { status: 201, headers: { "Content-Type": "application/json" } })
    },
  })
  assert.deepEqual(await createAmbassadorInvite(INPUT, client.invoke.bind(client)), RESULT)
  assert.equal(calls, 1)
})

test("sucesso projeta o contrato e descarta campos extras", async () => {
  const result = await createAmbassadorInvite(INPUT, async () => ({
    data: { ...RESULT, internal: "remover", embaixadora: { ...RESULT.embaixadora, invite_token_hash: "remover" } }, error: null,
  }))
  assert.deepEqual(result, RESULT)
})

for (const [status, code, expected] of [
  [400, "invalid_json", "Não foi possível enviar os dados. Confira o formulário."],
  [400, "nome_obrigatorio", "Informe o nome."],
  [400, "nome_muito_longo", "O nome deve ter no máximo 120 caracteres."],
  [400, "telefone_invalido", "Informe um telefone brasileiro válido com DDD."],
  [400, "email_obrigatorio", "Informe o e-mail."],
  [400, "email_invalido", "Informe um e-mail válido."],
  [400, "email_muito_longo", "O e-mail deve ter no máximo 254 caracteres."],
  [400, "instagram_invalido", "Confira o Instagram informado."],
  [400, "instagram_muito_longo", "O Instagram deve ter no máximo 60 caracteres."],
  [401, "unauthorized", "Sua sessão expirou ou é inválida. Entre novamente para continuar."],
  [403, "forbidden", "Você não tem autorização para criar convites neste acesso."],
  [403, "origin_not_allowed", "Você não tem autorização para criar convites neste acesso."],
  [409, "convite_ja_existe", "Já existe um convite pendente para esta pessoa."],
  [409, "embaixadora_ja_ativa", "Esta pessoa já é uma Embaixadora ativa."],
  [409, "embaixadora_inativa", "Já existe um cadastro inativo para esta pessoa."],
  [409, "embaixadora_rejeitada", "Já existe um cadastro rejeitado para esta pessoa."],
  [409, "telefone_ja_existe", "Este telefone já está cadastrado."],
  [409, "email_ja_existe", "Este e-mail já está cadastrado."],
  [500, "internal_error", "Não foi possível criar o convite por um erro interno. Confira a listagem antes de tentar novamente."],
  [400, "desconhecido", "Confira os dados informados e tente novamente."],
  [409, "desconhecido", "Já existe um cadastro conflitante. Confira a listagem."],
  [405, "method_not_allowed", INVITE_UNEXPECTED_ERROR],
]) {
  test(`FunctionsHttpError ${status}/${code}: mensagem permitida sem detalhes internos`, async () => {
    await assert.rejects(createAmbassadorInvite(INPUT, httpInvoke(status, code)), (error) => {
      assert.ok(error instanceof InviteRequestError)
      assert.equal(error.message, expected)
      assert.equal(error.context, undefined)
      assert.equal(error.cause, undefined)
      assert.ok(!error.message.includes("DETALHE_INTERNO"))
      return true
    })
  })
}

test("FunctionsHttpError sem JSON mantém mapeamento HTTP e não vaza HTML", async () => {
  await assert.rejects(createAmbassadorInvite(INPUT, async () => ({
    data: null, error: new FunctionsHttpError(new Response("<html>SEGREDO</html>", { status: 401 })),
  })), { message: "Sua sessão expirou ou é inválida. Entre novamente para continuar." })
})

test("erro HTTP lançado por invoke também é sanitizado", async () => {
  await assert.rejects(createAmbassadorInvite(INPUT, async () => {
    throw new FunctionsHttpError(new Response('{"error":"email_ja_existe"}', { status: 409 }))
  }), { message: "Este e-mail já está cadastrado." })
})

test("falhas de rede, rejeições e objetos inesperados nunca expõem mensagem original", async () => {
  for (const error of [new Error(RESULT.invite_url), { message: "SEGREDO", context: "SEGREDO" }, "SEGREDO"]) {
    await assert.rejects(createAmbassadorInvite(INPUT, async () => ({ data: null, error })), { message: INVITE_UNEXPECTED_ERROR })
    await assert.rejects(createAmbassadorInvite(INPUT, async () => { throw error }), { message: INVITE_UNEXPECTED_ERROR })
  }
})

test("respostas de sucesso malformadas não entram no estado de sucesso", async () => {
  for (const data of [null, {}, { ...RESULT, invite_url: "" }, { ...RESULT, embaixadora: { ...RESULT.embaixadora, status: "desconhecido" } }]) {
    await assert.rejects(createAmbassadorInvite(INPUT, async () => ({ data, error: null })), { message: INVITE_UNEXPECTED_ERROR })
  }
})

test("React Query real: segredo só chega ao estado efêmero, nunca ao cache de mutation/query", async () => {
  const client = new QueryClient()
  client.setQueryData(["embaixadoras"], [])
  let local = initialInviteDialogState()
  const snapshots = []
  const unsubscribe = client.getMutationCache().subscribe(() => {
    snapshots.push(JSON.stringify(client.getMutationCache().getAll().map((entry) => entry.state)))
  })
  const observer = new MutationObserver(client, createInviteMutationOptions(client, (result) => {
    local = inviteDialogReducer(local, { type: "success", result })
  }, successInvoke))
  try {
    assert.equal(await observer.mutate(INPUT), undefined)
    assert.deepEqual(local.result, RESULT)
    assert.equal(observer.getCurrentResult().data, undefined)
    assert.equal(client.getQueryState(["embaixadoras"]).isInvalidated, true)
    assert.deepEqual(client.getQueryData(["embaixadoras"]), [])
    for (const snapshot of snapshots) assert.ok(!snapshot.includes("SEGREDO_SOMENTE_TESTE"))
    assert.ok(!JSON.stringify(client.getQueryCache().getAll().map((query) => query.state)).includes("invite_url"))
    local = inviteDialogReducer(local, { type: "reset" })
    observer.reset()
    assert.deepEqual(local, initialInviteDialogState())
  } finally { unsubscribe(); client.clear() }
})

test("falha da mutation não invalida listagem e não faz retry automático", async () => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: 3 } } })
  client.setQueryData(["embaixadoras"], [])
  let calls = 0
  let delivered = false
  const observer = new MutationObserver(client, createInviteMutationOptions(client, () => { delivered = true }, async () => {
    calls++
    return { data: null, error: new Error("SEGREDO") }
  }))
  try {
    await assert.rejects(observer.mutate(INPUT), { message: INVITE_UNEXPECTED_ERROR })
    assert.equal(calls, 1)
    assert.equal(delivered, false)
    assert.equal(client.getQueryState(["embaixadoras"]).isInvalidated, false)
    assert.ok(!JSON.stringify(client.getMutationCache().getAll().map((entry) => entry.state)).includes("SEGREDO"))
  } finally { client.clear() }
})

test("falha de refetch não apaga sucesso ou provoca novo convite", async () => {
  let result
  const options = createInviteMutationOptions({ invalidateQueries: async () => { throw new Error("refetch falhou") } }, (value) => { result = value }, successInvoke)
  assert.equal(await options.mutationFn(INPUT), undefined)
  options.onSuccess()
  await Promise.resolve()
  assert.deepEqual(result, RESULT)
})

test("duas submissões simultâneas executam somente uma mutation", async () => {
  const guard = createInviteSubmissionGuard()
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
  const guard = createInviteSubmissionGuard()
  await assert.rejects(guard.run(async () => { throw new Error("falha") }))
  assert.equal(guard.isPending(), false)
  let called = false
  await guard.run(async () => { called = true })
  assert.equal(called, true)
})

test("reset limpa todos os campos, erro, link e dados da Embaixadora", () => {
  const populated = { fields: { ...INPUT }, error: "erro", result: structuredClone(RESULT) }
  const reset = inviteDialogReducer(populated, { type: "reset" })
  assert.deepEqual(reset, { fields: { nome: "", telefone: "", email: "", instagram: "" }, error: null, result: null })
  assert.notEqual(reset.fields, initialInviteDialogState().fields)
})

test("sucesso limpa formulário e erro; edição limpa erro anterior", () => {
  const initial = { fields: { ...INPUT }, error: "erro", result: null }
  const edited = inviteDialogReducer(initial, { type: "field", field: "instagram", value: "@outro" })
  assert.equal(edited.fields.instagram, "@outro")
  assert.equal(edited.error, null)
  const success = inviteDialogReducer(initial, { type: "success", result: RESULT })
  assert.deepEqual(success.fields, initialInviteDialogState().fields)
  assert.equal(success.error, null)
  assert.equal(success.result, RESULT)
})

test("validação UX exige nome/telefone/email, aceita Instagram opcional e não normaliza telefone", () => {
  for (const [field, message] of [["nome", "Informe o nome."], ["telefone", "Informe o telefone."], ["email", "Informe o e-mail."]]) {
    assert.equal(validateInviteFields({ ...INPUT, [field]: "   " }), message)
  }
  for (const instagram of ["", "usuario", "@usuario"]) assert.equal(validateInviteFields({ ...INPUT, instagram }), null)
  assert.equal(validateInviteFields({ ...INPUT, telefone: "123" }), null, "normalização/validação de negócio é do backend")
})

test("clipboard: aguarda sucesso e entrega só o link ao clipboard", async () => {
  const writes = []
  assert.equal(await copyInviteLink(RESULT.invite_url, async (value) => { writes.push(value) }), true)
  assert.deepEqual(writes, [RESULT.invite_url])
})

test("clipboard: falha síncrona ou assíncrona retorna false sem expor erro", async () => {
  assert.equal(await copyInviteLink(RESULT.invite_url, async () => { throw new Error(RESULT.invite_url) }), false)
  assert.equal(await copyInviteLink(RESULT.invite_url, () => { throw new Error("indisponível") }), false)
})

test("segurança estática complementar: sem credenciais manuais, armazenamento, navegação ou logs no código novo", () => {
  for (const path of [
    "../apps/admin/src/hooks/useCreateAmbassadorInvite.ts",
    "../apps/admin/src/lib/ambassadorInvite.ts",
    "../apps/admin/src/components/embaixadoras/ConvidarEmbaixadoraDialog.tsx",
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8")
    assert.doesNotMatch(source, /service_role|SUPABASE_SERVICE_ROLE_KEY|Authorization|access_token|refresh_token|localStorage|sessionStorage|console\.(log|error)|setQueryData|useNavigate|window\.location|href=/)
  }
  const dialog = readFileSync(new URL("../apps/admin/src/components/embaixadoras/ConvidarEmbaixadoraDialog.tsx", import.meta.url), "utf8")
  assert.match(dialog, /toast\.success\("Link copiado"\)/)
  assert.doesNotMatch(dialog, /toast\.[a-z]+\([^\n]*invite_url/)
})
