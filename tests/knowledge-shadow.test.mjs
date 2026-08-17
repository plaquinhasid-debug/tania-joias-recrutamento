import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { mapPublicKnowledgeRpcResponse } from "../supabase/functions/knowledge-service/contract.ts"
import { createKnowledgeServiceHandler } from "../supabase/functions/knowledge-service/handler.ts"
import { comparePilotKnowledge, parseRemoteKnowledgeItems, SHADOW_PILOT_SLUGS } from "../apps/landing/src/orchestrator/knowledge/ShadowKnowledgeCore.ts"
import { ShadowKnowledgeRepository } from "../apps/landing/src/orchestrator/knowledge/ShadowKnowledgeRepository.ts"

const ORIGIN = "https://recrutamento.example"
const publicRpcItem = (slug, n = 1) => ({ knowledge_id: `id-${slug}`, slug, categoria: "FAQ", titulo: `Título ${slug}`, conteudo: `Conteúdo ${slug}`, version_number: n })
const remoteItem = (slug, n = 1, content = `Conteúdo ${slug}`) => ({ knowledge_id: `id-${slug}`, slug, category: "FAQ", title: `Título ${slug}`, content, version: n })
const doc = (id, conteudo = "conteúdo local") => ({ id, titulo: "título", categoria: "FAQ", conteudo, tags: [], palavrasChave: [], prioridade: 1, visibility: "public", versao: 1, ativo: true, criadoEm: "", atualizadoEm: "" })
const repository = (documents, getAll = async () => documents) => ({ getAll, getById: async (id) => documents.find((item) => item.id === id) ?? null })
const eventPromise = () => { let resolve; const promise = new Promise((done) => { resolve = done }); return { promise, observer: resolve } }

test("mapper aceita catálogo válido com 9 itens públicos simulados", () => assert.equal(mapPublicKnowledgeRpcResponse(Array.from({ length: 9 }, (_, i) => publicRpcItem(`publico-${i}`))).length, 9))
test("campo audiencia/INTERNO falha fechado", () => assert.throws(() => mapPublicKnowledgeRpcResponse([{ ...publicRpcItem("x"), audiencia: "INTERNO" }]), /Unexpected/))
test("contrato remove nomes PT-BR", () => assert.deepEqual(Object.keys(mapPublicKnowledgeRpcResponse([publicRpcItem("x")])[0]), ["knowledge_id", "slug", "category", "title", "content", "version"]))
test("payload remoto inválido falha fechado", () => assert.throws(() => parseRemoteKnowledgeItems([{ slug: "x" }]), /invalid/))
test("payload remoto com auditoria é rejeitado", () => assert.throws(() => parseRemoteKnowledgeItems([{ ...remoteItem("x"), aprovado_por: "secret" }]), /unexpected/))
test("allowlist contém exatamente os quatro slugs autorizados", () => assert.deepEqual([...SHADOW_PILOT_SLUGS].sort(), ["comissao-por-faixa-de-valor-vendido", "garantia-por-tipo-de-peca", "prazo-referencia-consignacao-30-dias", "primeiro-mostruario-sem-caucao"].sort()))
test("outros KIs públicos não entram na comparação", () => assert.deepEqual(comparePilotKnowledge([doc("com-001-comissao")], [remoteItem("fora-do-piloto")]).remoteSlugs, []))

test("erro remoto preserva exatamente getAll/getById locais", async () => {
  const localDocs = [doc("com-001-comissao")]; const observed = eventPromise()
  const shadow = new ShadowKnowledgeRepository(repository(localDocs), repository([], async () => { throw new Error("network details") }), observed.observer)
  assert.strictEqual(await shadow.getAll(), localDocs)
  assert.strictEqual(await shadow.getById(localDocs[0].id), localDocs[0])
  shadow.observeQuestion("não logada", localDocs)
  const event = await observed.promise
  assert.equal(event.agreement, "not_compared")
  assert.equal(event.reason, "remote_unavailable")
  assert.equal(JSON.stringify(event).includes("network details"), false)
})
test("timeout remoto acima de 2500ms preserva local e vira not_compared", async () => {
  const localDocs = [doc("com-001-comissao")]; const observed = eventPromise()
  const remote = repository([], () => new Promise((resolve) => setTimeout(() => resolve([]), 2_600)))
  const shadow = new ShadowKnowledgeRepository(repository(localDocs), remote, observed.observer)
  assert.strictEqual(await shadow.getAll(), localDocs); shadow.observeQuestion("pergunta não registrada", localDocs)
  const event = await observed.promise
  assert.equal(event.remoteAvailable, false); assert.equal(event.agreement, "not_compared"); assert.equal(event.reason, "remote_timeout")
})
test("payload remoto inválido preserva local e usa reason fechado", async () => {
  const localDocs = [doc("com-001-comissao")]; const observed = eventPromise()
  const remote = repository([], async () => { parseRemoteKnowledgeItems([{ slug: "inválido" }]); return [] })
  const shadow = new ShadowKnowledgeRepository(repository(localDocs), remote, observed.observer, 50)
  assert.strictEqual(await shadow.getAll(), localDocs); shadow.observeQuestion("não sai do cliente", localDocs)
  const event = await observed.promise
  assert.equal(event.agreement, "not_compared"); assert.equal(event.reason, "remote_invalid_payload")
})
test("observer recebe concordância real", async () => {
  const localDocs = [doc("com-001-comissao", "mesmo conteúdo")]; const observed = eventPromise()
  const shadow = new ShadowKnowledgeRepository(repository(localDocs), repository([doc("comissao-por-faixa-de-valor-vendido", "mesmo conteúdo")]), observed.observer, 50)
  shadow.observeQuestion("não logada", localDocs); assert.equal((await observed.promise).agreement, "agreement")
})
test("observer recebe divergência somente após comparação real", async () => {
  const localDocs = [doc("com-001-garantia", "local")]; const observed = eventPromise()
  const shadow = new ShadowKnowledgeRepository(repository(localDocs), repository([doc("garantia-por-tipo-de-peca", "remoto diferente")]), observed.observer, 50)
  shadow.observeQuestion("não logada", localDocs); const event = await observed.promise
  assert.equal(event.remoteAvailable, true); assert.equal(event.agreement, "divergence")
})
test("shadow nunca adiciona conteúdo remoto ao retorno local", async () => {
  const localDocs = [doc("com-001-comissao", "LOCAL OFICIAL")]
  const shadow = new ShadowKnowledgeRepository(repository(localDocs), repository([doc("comissao-por-faixa-de-valor-vendido", "REMOTO NÃO VISÍVEL")]), () => {}, 50)
  const result = await shadow.getAll(); assert.strictEqual(result, localDocs); assert.equal(JSON.stringify(result).includes("REMOTO NÃO VISÍVEL"), false)
})

function handler(readPublicKnowledge = async () => [publicRpcItem("x")], logError = () => {}) { return createKnowledgeServiceHandler({ allowedOrigins: [ORIGIN], readPublicKnowledge, logError }) }
const request = (url, init = {}) => new Request(url, { ...init, headers: { origin: ORIGIN, ...(init.headers ?? {}) } })
test("handler rejeita query string sem chamar RPC", async () => { let calls = 0; const response = await handler(async () => { calls++; return [] })(request("https://edge.example?slug=x")); assert.equal(response.status, 400); assert.equal(calls, 0) })
test("handler rejeita audience/company/question/slug/status/version", async () => {
  for (const key of ["audience", "company_id", "question", "slug", "status", "version"]) {
    const response = await handler()(request("https://edge.example", { method: "POST", body: JSON.stringify({ [key]: "x" }) }))
    assert.equal(response.status, 400, key); assert.deepEqual(await response.json(), { error: "parameters_not_allowed" }, key)
  }
})
test("handler aceita GET sem parâmetros", async () => assert.equal((await handler()(request("https://edge.example"))).status, 200))
test("handler aceita POST vazio e POST {}", async () => { assert.equal((await handler()(request("https://edge.example", { method: "POST" }))).status, 200); assert.equal((await handler()(request("https://edge.example", { method: "POST", body: "{}" }))).status, 200) })
test("erro da RPC vira 502, contrato público e log normalizado", async () => {
  const codes = []; const response = await handler(async () => { throw new Error("remote_rpc_failed") }, (code) => codes.push(code))(request("https://edge.example"))
  assert.equal(response.status, 502); assert.deepEqual(await response.json(), { error: "knowledge_unavailable" }); assert.deepEqual(codes, ["remote_rpc_failed"])
})

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8")
test("Claude mantém uma única chamada estrutural no pipeline", () => { const source = read("../apps/landing/src/orchestrator/pipeline/answerCandidateQuestion.ts"); assert.equal((source.match(/gateway\.request\(/g) ?? []).length, 1) })
test("IPR, finalize-candidate e wizard permanecem fora do diff shadow", () => { const source = read("../apps/landing/src/orchestrator/knowledge/ShadowKnowledgeRepository.ts") + read("../apps/landing/src/orchestrator/knowledge/KnowledgeEngine.ts"); assert.doesNotMatch(source, /calcularIpr|finalize-candidate|SOFIA_STEPS|advanceAfterAnswer/) })
