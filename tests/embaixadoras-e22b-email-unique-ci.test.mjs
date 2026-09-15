import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

// -----------------------------------------------------------------------
// EMBAIXADORAS TANIA JOIAS V1 — E2.2-B. Testes ESTÁTICOS (leitura de texto
// do arquivo .sql, sem conexão nenhuma com banco). Garante só a unicidade
// case-insensitive de embaixadoras.email — nada mais.
// -----------------------------------------------------------------------

const MIGRATION_PATH = "../supabase/migrations/20260915220000_add_embaixadoras_email_unique_ci.sql"
const rawSql = fs.readFileSync(new URL(MIGRATION_PATH, import.meta.url), "utf8")
const sql = rawSql.replace(/--.*$/gm, "")

test("cria exatamente um CREATE UNIQUE INDEX", () => {
  const matches = [...sql.matchAll(/create unique index/gi)]
  assert.equal(matches.length, 1, "esperava exatamente 1 CREATE UNIQUE INDEX")
})

test("alvo é public.embaixadoras", () => {
  assert.match(sql, /create unique index embaixadoras_email_lower_unique_idx\s*\n?\s*on public\.embaixadoras/i)
})

test("expressão é lower(email)", () => {
  assert.match(sql, /\(lower\(email\)\)/i)
})

test("nome do índice é o sugerido e estável", () => {
  assert.match(sql, /embaixadoras_email_lower_unique_idx/i)
})

test("não usa citext", () => {
  assert.ok(!/citext/i.test(sql))
})

test("não altera o tipo da coluna email (nenhum ALTER COLUMN)", () => {
  assert.ok(!/alter column email/i.test(sql))
  assert.ok(!/type text/i.test(sql))
})

test("não cria nenhuma coluna nova (nenhum ADD COLUMN)", () => {
  assert.ok(!/add column/i.test(sql))
})

test("não toca RLS/policies/grants", () => {
  assert.ok(!/enable row level security/i.test(sql))
  assert.ok(!/create policy|drop policy|alter policy/i.test(sql))
  assert.ok(!/\bgrant\b|\brevoke\b/i.test(sql))
})

test("não toca nenhuma outra tabela além de embaixadoras", () => {
  const alterOrCreateTable = [...sql.matchAll(/(?:alter|create|drop)\s+table\s+(?:public\.)?(\w+)/gi)]
  assert.equal(alterOrCreateTable.length, 0, "esta migration não deveria conter nenhum ALTER/CREATE/DROP TABLE — só CREATE INDEX")
})

test("não contém INSERT/UPDATE/DELETE — só DDL de índice", () => {
  assert.ok(!/\binsert into\b/i.test(sql))
  assert.ok(!/\bupdate\s+\w+\s+set\b/i.test(sql))
  assert.ok(!/\bdelete\s+from\b/i.test(sql))
})

test("não menciona Sofia, orchestrator, finalize-candidate ou conversations", () => {
  assert.ok(!/\bsofia\b/i.test(sql))
  assert.ok(!/finalize-candidate/i.test(sql))
  assert.ok(!/\bconversations\b/i.test(sql))
})

test("não menciona auth.users nem cria/altera função (não toca Auth)", () => {
  assert.ok(!/auth\.users/i.test(sql))
  assert.ok(!/create (or replace )?function/i.test(sql))
})

test("balanceamento estrutural: parênteses casados", () => {
  const statements = sql.split(";").map((s) => s.trim()).filter(Boolean)
  assert.ok(statements.length >= 1)
  for (const [i, stmt] of statements.entries()) {
    const opens = (stmt.match(/\(/g) || []).length
    const closes = (stmt.match(/\)/g) || []).length
    assert.equal(opens, closes, `statement #${i} com parênteses desbalanceados: ${stmt.slice(0, 80)}`)
  }
})
