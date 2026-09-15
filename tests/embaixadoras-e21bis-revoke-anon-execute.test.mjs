import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

// -----------------------------------------------------------------------
// EMBAIXADORAS TANIA JOIAS V1 — E2.1-bis-E. Testes ESTÁTICOS (leitura de
// texto do arquivo .sql, sem conexão nenhuma com banco). Esta migration
// corrige a divergência encontrada na auditoria pós-aplicação da
// E2.1-bis-D: anon tinha EXECUTE em is_equipe() por causa de um ALTER
// DEFAULT PRIVILEGES já existente no projeto.
// -----------------------------------------------------------------------

const MIGRATION_PATH = "../supabase/migrations/20260915210000_revoke_is_equipe_anon_execute.sql"
const rawSql = fs.readFileSync(new URL(MIGRATION_PATH, import.meta.url), "utf8")
const sql = rawSql.replace(/--.*$/gm, "")

const PREVIOUS_APPLIED_PATH = "../supabase/migrations/20260915200000_harden_authenticated_staff_authorization.sql"
const INVITE_PATH = "../supabase/migrations/20260915190000_add_embaixadoras_invite_hardening.sql"

test("a migration já aplicada (harden_authenticated_staff_authorization) NÃO é editada nesta rodada", () => {
  const previous = fs.readFileSync(new URL(PREVIOUS_APPLIED_PATH, import.meta.url), "utf8")
  // mesmas 3 assinaturas centrais da E2.1-bis-B, inalteradas
  assert.ok(previous.includes("alter table profiles alter column papel set default 'sem_papel';"))
  assert.ok(previous.includes("create or replace function public.is_equipe()"))
  assert.ok(previous.includes("revoke update on profiles from authenticated;"))
})

test("a migration de convite (E2.1) continua intocada e não é mencionada aqui", () => {
  const invite = fs.readFileSync(new URL(INVITE_PATH, import.meta.url), "utf8")
  assert.ok(invite.includes("invite_token_hash text not null"))
  assert.ok(!/invite_token_hash|invite_expira_em|invite_claim/i.test(sql))
})

test("contém exatamente o REVOKE EXECUTE ... FROM anon esperado", () => {
  assert.match(sql, /revoke execute on function public\.is_equipe\(\) from anon\s*;/i)
})

test("não concede/revoga nada além disso — nenhum outro GRANT/REVOKE", () => {
  const grantRevokeStatements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => /^(grant|revoke)/i.test(s))
  assert.equal(grantRevokeStatements.length, 1, "esperava exatamente 1 instrução GRANT/REVOKE nesta migration")
  assert.match(grantRevokeStatements[0], /^revoke execute on function public\.is_equipe\(\) from anon$/i)
})

test("não altera os default privileges globais do projeto", () => {
  assert.ok(!/alter default privileges/i.test(sql))
})

test("não cria/altera/derruba nenhuma tabela, policy ou outra função", () => {
  assert.ok(!/create table|drop table|alter table/i.test(sql))
  assert.ok(!/create policy|drop policy/i.test(sql))
  assert.ok(!/create (or replace )?function/i.test(sql), "não deveria recriar is_equipe() nem criar outra função")
})

test("EXECUTE de authenticated não é tocado (nenhum REVOKE/GRANT mencionando authenticated)", () => {
  assert.ok(!/authenticated/i.test(sql))
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
