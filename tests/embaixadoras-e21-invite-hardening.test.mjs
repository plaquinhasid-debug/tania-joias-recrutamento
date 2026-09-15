import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

// -----------------------------------------------------------------------
// EMBAIXADORAS TANIA JOIAS V1 — E2.1. Testes ESTÁTICOS (leitura de texto
// do arquivo .sql, sem conexão nenhuma com banco — esta migration NÃO é
// aplicada em lugar nenhum aqui, local ou remoto).
// -----------------------------------------------------------------------

const MIGRATION_PATH = "../supabase/migrations/20260915190000_add_embaixadoras_invite_hardening.sql"
const rawSql = fs.readFileSync(new URL(MIGRATION_PATH, import.meta.url), "utf8")
const sql = rawSql.replace(/--.*$/gm, "")

const E1_MIGRATION_PATH = "../supabase/migrations/20260915180000_add_embaixadoras_v1_schema.sql"

test("a migration E1 já aplicada não é editada por esta rodada", () => {
  const e1Sql = fs.readFileSync(new URL(E1_MIGRATION_PATH, import.meta.url), "utf8")
  assert.ok(e1Sql.includes("invite_token uuid not null unique default gen_random_uuid()"))
  assert.ok(!/invite_token_hash/i.test(e1Sql))
})

test("invite_token (uuid) antigo é removido", () => {
  assert.match(sql, /alter table embaixadoras drop column invite_token\s*;/i)
})

test("invite_token_hash existe, NOT NULL, UNIQUE", () => {
  assert.match(sql, /add column invite_token_hash text not null/i)
  assert.match(sql, /add constraint embaixadoras_invite_token_hash_key unique \(invite_token_hash\)/i)
})

test("CHECK de invite_token_hash exige SHA-256 hex minúsculo de 64 caracteres", () => {
  assert.match(sql, /check \(invite_token_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/i)
})

test("invite_expira_em NOT NULL com default de 7 dias", () => {
  assert.match(sql, /add column invite_expira_em timestamptz not null default \(now\(\) \+ interval '7 days'\)/i)
})

test("email vira NOT NULL", () => {
  assert.match(sql, /alter column email set not null/i)
})

test("colunas de claim/reserva presentes e nullable (sem NOT NULL)", () => {
  assert.match(sql, /add column invite_claim_id uuid,/i)
  assert.match(sql, /add column invite_claimed_em timestamptz,/i)
  assert.match(sql, /add column invite_claim_expira_em timestamptz;/i)
  // nenhuma delas pode ter "not null" na mesma linha de declaração
  assert.ok(!/invite_claim_id uuid not null/i.test(sql))
  assert.ok(!/invite_claimed_em timestamptz not null/i.test(sql))
  assert.ok(!/invite_claim_expira_em timestamptz not null/i.test(sql))
})

test("CHECK garante consistência dos 3 campos de claim (todos nulos ou todos preenchidos)", () => {
  assert.match(
    sql,
    /check \(\s*\(invite_claim_id is null and invite_claimed_em is null and invite_claim_expira_em is null\)\s*or \(invite_claim_id is not null and invite_claimed_em is not null and invite_claim_expira_em is not null\)\s*\)/i,
  )
})

test("invite_token_usado_em NÃO é alterada/removida/recriada nesta migration (semântica preservada da E1: só sucesso final)", () => {
  // A coluna pode ser MENCIONADA em texto de `comment on column` (documentação),
  // mas nenhuma instrução DDL pode tocá-la (alter/add/drop column, default novo).
  assert.ok(!/(alter|add|drop)\s+column\s+invite_token_usado_em/i.test(sql))
  assert.ok(!/invite_token_usado_em\s+timestamptz/i.test(sql), "não deveria haver (re)declaração de tipo dessa coluna")
})

test("nenhuma tabela além de embaixadoras é tocada", () => {
  const altered = [...sql.matchAll(/alter table (?:public\.)?(\w+)/gim)].map((m) => m[1])
  assert.ok(altered.length > 0, "esperava pelo menos um ALTER TABLE")
  for (const t of altered) {
    assert.equal(t, "embaixadoras", `ALTER TABLE inesperado em '${t}' — só 'embaixadoras' deveria aparecer`)
  }
})

test("nenhum CREATE TABLE / DROP TABLE / CREATE POLICY nesta migration", () => {
  assert.ok(!/create table/i.test(sql))
  assert.ok(!/drop table/i.test(sql))
  assert.ok(!/create policy/i.test(sql))
  assert.ok(!/drop policy/i.test(sql))
})

test("não menciona leads/leads_ficha/conversations/answers/profiles/settings/campaigns/Sofia/finalize-candidate", () => {
  const forbidden = ["leads_ficha", "conversations", "answers", "settings", "campaigns", "finalize-candidate", "Sofia"]
  for (const term of forbidden) {
    assert.ok(!new RegExp(`\\b${term}\\b`, "i").test(sql), `não deveria mencionar '${term}'`)
  }
  // 'leads' sozinho não aparece (o termo 'leads_ficha' já foi checado acima)
  assert.ok(!/\bleads\b/i.test(sql))
  // 'profiles' também não aparece (não usamos aprovada_por/etc. nesta migration)
  assert.ok(!/\bprofiles\b/i.test(sql))
})

test("nenhuma coluna de chave PIX, CPF, endereço ou data de nascimento é criada", () => {
  assert.ok(!/chave_pix/i.test(sql))
  assert.ok(!/\bcpf\b/i.test(sql))
  assert.ok(!/endereco/i.test(sql))
  assert.ok(!/data_nascimento|nascimento/i.test(sql))
})

test("balanceamento estrutural: parênteses casados em cada statement", () => {
  const statements = sql.split(";").map((s) => s.trim()).filter(Boolean)
  assert.ok(statements.length >= 8, "esperava várias instruções ALTER TABLE/CONSTRAINT/COMMENT")
  for (const [i, stmt] of statements.entries()) {
    const opens = (stmt.match(/\(/g) || []).length
    const closes = (stmt.match(/\)/g) || []).length
    assert.equal(opens, closes, `statement #${i} com parênteses desbalanceados: ${stmt.slice(0, 80)}`)
  }
})
