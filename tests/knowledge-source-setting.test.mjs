import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { resolveKnowledgeSourceMode } from "../supabase/functions/sofia-config/knowledge-source.ts"

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8")
const migration = read("../supabase/migrations/20260817020000_add_sofia_knowledge_source_setting.sql")
const configFunction = read("../supabase/functions/sofia-config/index.ts")

test("aceita LOCAL", () => assert.equal(resolveKnowledgeSourceMode({ modo: "LOCAL" }), "LOCAL"))
test("aceita SHADOW", () => assert.equal(resolveKnowledgeSourceMode({ modo: "SHADOW" }), "SHADOW"))
test("aceita PILOT como configuração", () => assert.equal(resolveKnowledgeSourceMode({ modo: "PILOT" }), "PILOT"))
test("rejeita valor arbitrário com fallback SHADOW", () => assert.equal(resolveKnowledgeSourceMode({ modo: "OFICIAL" }), "SHADOW"))
test("rejeita array", () => assert.equal(resolveKnowledgeSourceMode(["SHADOW"]), "SHADOW"))
test("rejeita string pura", () => assert.equal(resolveKnowledgeSourceMode("SHADOW"), "SHADOW"))
test("rejeita null", () => assert.equal(resolveKnowledgeSourceMode(null), "SHADOW"))
test("rejeita objeto vazio", () => assert.equal(resolveKnowledgeSourceMode({}), "SHADOW"))
test("rejeita objeto com chave diferente", () => assert.equal(resolveKnowledgeSourceMode({ outra: "SHADOW" }), "SHADOW"))
test("seed inicial da migration é SHADOW", () => assert.match(migration, /'\{"modo": "SHADOW"\}'::jsonb/))
test("ausência da configuração não ativa PILOT", () => assert.equal(resolveKnowledgeSourceMode(undefined), "SHADOW"))
test("valor inválido não ativa PILOT", () => assert.equal(resolveKnowledgeSourceMode({ modo: 1 }), "SHADOW"))
test("shape ampliado não contorna contrato fechado", () => assert.equal(resolveKnowledgeSourceMode({ modo: "PILOT", extra: true }), "SHADOW"))
test("falha global de leitura retorna SHADOW", () => assert.match(configFunction, /knowledge_source_mode: "SHADOW"/))
test("migration permite exatamente LOCAL SHADOW PILOT", () => {
  assert.match(migration, /in \('LOCAL', 'SHADOW', 'PILOT'\)/)
  assert.match(migration, /valor = jsonb_build_object\('modo', valor -> 'modo'\)/)
  assert.doesNotMatch(migration, /jsonb_object_length/)
  assert.doesNotMatch(migration, /CEREBRO_OFICIAL|ACTIVE/)
})
test("migration não concede privilégios ao browser", () => assert.doesNotMatch(migration, /grant|policy|anon/i))
test("PILOT é conectado ao Knowledge Engine somente pela retomada 010", () => {
  const engine = read("../apps/landing/src/orchestrator/knowledge/KnowledgeEngine.ts")
  assert.match(engine, /mode === "PILOT".*PilotKnowledgeRepository/)
  assert.match(engine, /mode: KnowledgeSourceModeValue = "SHADOW"/)
})
test("IPR finalize wizard e Admin não são importados pela configuração", () => {
  const source = migration + configFunction
  assert.doesNotMatch(source, /calcularIpr|finalize-candidate|SOFIA_STEPS|apps\/admin/)
})
