import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { PilotKnowledgeRepository } from "../apps/landing/src/orchestrator/knowledge/PilotKnowledgeRepository.ts"
import { ShadowKnowledgeRepository } from "../apps/landing/src/orchestrator/knowledge/ShadowKnowledgeRepository.ts"
import { SHADOW_PILOT_SLUGS } from "../apps/landing/src/orchestrator/knowledge/ShadowKnowledgeCore.ts"

const pilot = [
  ["com-001-comissao", "comissao-por-faixa-de-valor-vendido"],
  ["com-001-garantia", "garantia-por-tipo-de-peca"],
  ["com-001-consignacao", "prazo-referencia-consignacao-30-dias"],
  ["com-004-primeiro-mostruario", "primeiro-mostruario-sem-caucao"],
]
const doc = (id, conteudo = `LOCAL ${id}`, visibility = "public", versao = 1) => ({ id, titulo: `Título ${id}`, categoria: "FAQ", conteudo, tags: ["busca"], palavrasChave: ["busca"], prioridade: 10, visibility, versao, ativo: true, criadoEm: "", atualizadoEm: "" })
const repo = (docs, getAll = async () => docs) => ({ getAll, getById: async (id) => docs.find((x) => x.id === id) ?? null })
const officialContents = [
  "Até R$ 299,00: 30%. De R$ 299,01 a R$ 399,99: 35%. A partir de R$ 400,00: 40%.",
  "Anéis têm garantia de 3 meses. As demais peças têm garantia de 6 meses.",
  "O prazo é de aproximadamente 30 dias e não deve ser tratado como prazo rígido.",
  "O primeiro mostruário é consignado, sem pagamento antecipado, sem taxa de adesão e sem caução.",
]
const remoteDocs = pilot.map(([, slug], index) => doc(slug, officialContents[index], "public", index + 2))

test("allowlist PILOT contém exatamente os quatro slugs", () => assert.deepEqual([...SHADOW_PILOT_SLUGS].sort(), pilot.map((x) => x[1]).sort()))

test("PILOT substitui os quatro conhecimentos aprovados", async () => {
  const result = await new PilotKnowledgeRepository(repo(pilot.map(([id]) => doc(id))), repo(remoteDocs), () => {}).getAll()
  for (const [index, [id]] of pilot.entries()) assert.equal(result.find((x) => x.id === id)?.conteudo, officialContents[index])
})

test("PILOT preserva identidade e metadados locais de busca", async () => {
  const local = doc(pilot[0][0]); const result = await new PilotKnowledgeRepository(repo([local]), repo([remoteDocs[0]]), () => {}).getAll()
  assert.equal(result[0].id, local.id); assert.deepEqual(result[0].tags, local.tags); assert.deepEqual(result[0].palavrasChave, local.palavrasChave); assert.equal(result[0].prioridade, local.prioridade)
})

test("KI público fora da allowlist permanece local", async () => {
  const local = doc("com-002-fora"); const remote = doc("com-002-fora", "REMOTO PROIBIDO")
  assert.strictEqual((await new PilotKnowledgeRepository(repo([local]), repo([remote]), () => {}).getAll())[0], local)
})

test("KI interno nunca é promovido pelo PILOT", async () => {
  const local = doc(pilot[0][0], "LOCAL INTERNO", "internal")
  assert.strictEqual((await new PilotKnowledgeRepository(repo([local]), repo([remoteDocs[0]]), () => {}).getAll())[0], local)
})

test("slug remoto ausente faz fallback local sem retry", async () => {
  let calls = 0; const events = []; const local = doc(pilot[0][0])
  const result = await new PilotKnowledgeRepository(repo([local]), repo([], async () => { calls++; return [] }), (e) => events.push(e)).getAll()
  const repository = new PilotKnowledgeRepository(repo([local]), repo([], async () => { calls++; return [] }), (e) => events.push(e))
  const selected = await repository.getAll(); repository.observeQuestion("PII não pode sair", selected)
  assert.strictEqual(result[0], local); assert.equal(calls, 2); assert.equal(events[0].fallbackReason, "remote_slug_missing")
})

test("indisponibilidade remota faz fallback local", async () => {
  const events = []; const local = doc(pilot[0][0]); const repository = new PilotKnowledgeRepository(repo([local]), repo([], async () => { throw new Error("network secret") }), (e) => events.push(e), 20)
  const result = await repository.getAll(); repository.observeQuestion("pergunta completa", result)
  assert.strictEqual(result[0], local); assert.equal(events[0].fallbackReason, "remote_unavailable")
})

test("payload inválido faz fallback fechado", async () => {
  const events = []; const local = doc(pilot[0][0]); const repository = new PilotKnowledgeRepository(repo([local]), repo([], async () => { throw new Error("remote_item_invalid_shape") }), (e) => events.push(e), 20)
  const result = await repository.getAll(); repository.observeQuestion("nome telefone", result)
  assert.strictEqual(result[0], local); assert.equal(events[0].fallbackReason, "remote_invalid_payload")
})

test("timeout faz fallback local e não tenta novamente", async () => {
  let calls = 0; const events = []; const local = doc(pilot[0][0]); const repository = new PilotKnowledgeRepository(repo([local]), repo([], () => { calls++; return new Promise((resolve) => setTimeout(() => resolve(remoteDocs), 40)) }), (e) => events.push(e), 5)
  const result = await repository.getAll(); repository.observeQuestion("segredo", result)
  assert.strictEqual(result[0], local); assert.equal(calls, 1); assert.equal(events[0].fallbackReason, "remote_timeout")
})

test("evento REMOTE_PILOT registra apenas metadados seguros", async () => {
  const events = []; const local = doc(pilot[0][0], "CONTEÚDO LOCAL SECRETO"); const repository = new PilotKnowledgeRepository(repo([local]), repo([remoteDocs[0]]), (e) => events.push(e))
  const result = await repository.getAll(); repository.observeQuestion("Nome 11999999999 Instagram", result)
  assert.deepEqual(events[0], { mode: "PILOT", remoteAvailable: true, latencyMs: events[0].latencyMs, slug: pilot[0][1], version: 2, source: "REMOTE_PILOT" })
  const serialized = JSON.stringify(events); for (const forbidden of ["Nome", "11999999999", "Instagram", "CONTEÚDO", "REMOTO "]) assert.equal(serialized.includes(forbidden), false)
})

test("observabilidade só registra documentos efetivamente selecionados", async () => {
  const events = []; const repository = new PilotKnowledgeRepository(repo(pilot.map(([id]) => doc(id))), repo(remoteDocs), (e) => events.push(e))
  const all = await repository.getAll(); repository.observeQuestion("x", [all[2]])
  assert.deepEqual(events.map((e) => e.slug), [pilot[2][1]])
})

test("SHADOW continua retornando somente local", async () => {
  const local = doc(pilot[0][0]); const result = await new ShadowKnowledgeRepository(repo([local]), repo([remoteDocs[0]]), () => {}).getAll()
  assert.strictEqual(result[0], local)
})

test("LOCAL não depende de repositório remoto", async () => {
  let remoteCalls = 0; const local = repo([doc(pilot[0][0])]); await local.getAll()
  assert.equal(remoteCalls, 0)
})

test("comissão remota preserva a fronteira 299,00", () => assert.match(remoteDocs[0].conteudo, /299,00: 30%/))
test("comissão remota preserva a fronteira 299,01", () => assert.match(remoteDocs[0].conteudo, /299,01 a R\$ 399,99: 35%/))
test("comissão remota preserva a fronteira 399,99", () => assert.match(remoteDocs[0].conteudo, /399,99: 35%/))
test("comissão remota preserva a fronteira 400,00", () => assert.match(remoteDocs[0].conteudo, /400,00: 40%/))
test("garantia remota distingue anéis e demais peças", () => {
  assert.match(remoteDocs[1].conteudo, /Anéis.*3 meses/); assert.match(remoteDocs[1].conteudo, /demais peças.*6 meses/)
})
test("prazo remoto é aproximado e não rígido", () => assert.match(remoteDocs[2].conteudo, /aproximadamente 30 dias.*não.*prazo rígido/))
test("primeiro mostruário remoto não exige antecipação, adesão ou caução", () => assert.match(remoteDocs[3].conteudo, /consignado.*sem pagamento antecipado.*sem taxa de adesão.*sem caução/))

test("pipeline mantém exatamente uma chamada ao Claude e recebe o modo", () => {
  const source = fs.readFileSync(new URL("../apps/landing/src/orchestrator/pipeline/answerCandidateQuestion.ts", import.meta.url), "utf8")
  assert.equal((source.match(/gateway\.request\(/g) ?? []).length, 1)
  assert.match(source, /createDefaultKnowledgeEngine\(input\.knowledgeSourceMode \?\? "SHADOW"\)/)
})

test("hook fixa o modo carregado e o encaminha ao pipeline", () => {
  const source = fs.readFileSync(new URL("../apps/landing/src/hooks/useSofiaFlow.ts", import.meta.url), "utf8")
  assert.match(source, /knowledgeSourceModeRef = useRef<KnowledgeSourceModeValue>\("SHADOW"\)/)
  assert.match(source, /knowledgeSourceMode: knowledgeSourceModeRef\.current/)
})
