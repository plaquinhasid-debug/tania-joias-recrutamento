import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

// -----------------------------------------------------------------------
// EMBAIXADORAS TANIA JOIAS V1 — E2.6-A. Testes ESTÁTICOS (leitura de texto
// do arquivo .sql, sem conexão nenhuma com banco — mesmo padrão de
// embaixadoras-e21bis-revoke-anon-execute.test.mjs). Esta migration NÃO
// foi aplicada em produção nesta rodada.
// -----------------------------------------------------------------------

const MIGRATION_PATH = "../supabase/migrations/20260917000000_add_resend_ambassador_invite_rpc.sql"
const rawSql = fs.readFileSync(new URL(MIGRATION_PATH, import.meta.url), "utf8")
const sql = rawSql.replace(/--.*$/gm, "")

test("define exatamente a função public.resend_ambassador_invite com os 4 parâmetros esperados", () => {
  assert.match(
    sql,
    /create or replace function public\.resend_ambassador_invite\(\s*p_embaixadora_id uuid,\s*p_expected_updated_at timestamptz,\s*p_new_token_hash text,\s*p_new_expira_em timestamptz\s*\)/,
  )
})

test("é SECURITY DEFINER com search_path fixo (mesmo padrão das RPCs de resgate)", () => {
  assert.match(sql, /security definer/i)
  assert.match(sql, /set search_path = public/i)
})

test("o UPDATE exige status='convidada' e invite_token_usado_em IS NULL", () => {
  assert.match(sql, /status = 'convidada'/)
  assert.match(sql, /invite_token_usado_em is null/i)
})

test("o UPDATE exige updated_at = p_expected_updated_at (bloqueio otimista contra dois reenvios concorrentes)", () => {
  assert.match(sql, /updated_at = p_expected_updated_at/)
})

test("o UPDATE nunca reenvia enquanto há uma reserva de resgate ativa (mesma condição de claim_ambassador_invite)", () => {
  assert.match(sql, /invite_claimed_em is null or invite_claim_expira_em < now\(\)/)
})

test("o UPDATE só toca invite_token_hash e invite_expira_em — nunca nome/telefone/email/instagram/status/user_id/codigo_referral", () => {
  const setMatch = sql.match(/update public\.embaixadoras\s+set([\s\S]*?)where/i)
  assert.ok(setMatch, "deveria encontrar a cláusula SET do UPDATE")
  const setClause = setMatch[1]
  assert.match(setClause, /invite_token_hash = p_new_token_hash/)
  assert.match(setClause, /invite_expira_em = p_new_expira_em/)
  for (const forbidden of ["nome =", "telefone_normalizado =", "email =", "instagram =", "status =", "user_id =", "codigo_referral ="]) {
    assert.ok(!setClause.includes(forbidden), `SET não deveria tocar em "${forbidden}"`)
  }
})

test("RETURNING devolve só id e invite_expira_em — nunca nome/email/telefone/hash", () => {
  assert.match(sql, /returning embaixadoras\.id, embaixadoras\.invite_expira_em\s*;/)
})

test("REVOKE/GRANT: só service_role pode executar, nunca public/anon/authenticated", () => {
  assert.match(
    sql,
    /revoke all on function public\.resend_ambassador_invite\(uuid, timestamptz, text, timestamptz\) from public, anon, authenticated\s*;/i,
  )
  assert.match(
    sql,
    /grant execute on function public\.resend_ambassador_invite\(uuid, timestamptz, text, timestamptz\) to service_role\s*;/i,
  )
})

test("nunca insere linha nova (sem INSERT) e nunca apaga nada (sem DELETE/DROP TABLE)", () => {
  assert.ok(!/insert into/i.test(sql))
  assert.ok(!/delete from/i.test(sql))
  assert.ok(!/drop table/i.test(sql))
})

test("não altera nenhuma outra função/tabela existente (só cria a nova RPC)", () => {
  assert.ok(!/create table|alter table|drop table/i.test(sql))
  assert.ok(!/create or replace function public\.(claim_ambassador_invite|finalize_ambassador_invite|release_ambassador_invite_claim|is_equipe|handle_new_user|set_updated_at)/i.test(sql))
})

test("balanceamento estrutural: parênteses casados em cada statement", () => {
  const statements = sql.split(";").map((s) => s.trim()).filter(Boolean)
  assert.ok(statements.length >= 1)
  for (const [i, stmt] of statements.entries()) {
    const opens = (stmt.match(/\(/g) || []).length
    const closes = (stmt.match(/\)/g) || []).length
    assert.equal(opens, closes, `statement #${i} com parênteses desbalanceados: ${stmt.slice(0, 80)}`)
  }
})

test("comment on function documenta o comportamento (mesma disciplina das RPCs de resgate)", () => {
  assert.match(sql, /comment on function public\.resend_ambassador_invite\(uuid, timestamptz, text, timestamptz\) is/)
})
