import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

// -----------------------------------------------------------------------
// EMBAIXADORAS TANIA JOIAS V1 — E2.1-bis-B. Testes ESTÁTICOS (leitura de
// texto do arquivo .sql, sem conexão nenhuma com banco — esta migration
// NÃO é aplicada em lugar nenhum aqui, local ou remoto).
// -----------------------------------------------------------------------

const MIGRATION_PATH = "../supabase/migrations/20260915200000_harden_authenticated_staff_authorization.sql"
const rawSql = fs.readFileSync(new URL(MIGRATION_PATH, import.meta.url), "utf8")
const sql = rawSql.replace(/--.*$/gm, "")

const E1_PATH = "../supabase/migrations/20260915180000_add_embaixadoras_v1_schema.sql"
const E21_PATH = "../supabase/migrations/20260915190000_add_embaixadoras_invite_hardening.sql"

test("as migrations anteriores (E1 e E2.1 de convite) não são editadas por esta rodada", () => {
  const e1 = fs.readFileSync(new URL(E1_PATH, import.meta.url), "utf8")
  const e21 = fs.readFileSync(new URL(E21_PATH, import.meta.url), "utf8")
  assert.ok(e1.includes("create table embaixadoras ("))
  assert.ok(e21.includes("invite_token_hash text not null"))
})

test("default de profiles.papel deixa de ser 'equipe' -> vira 'sem_papel'", () => {
  assert.match(sql, /alter table profiles alter column papel set default 'sem_papel'\s*;/i)
  assert.ok(!/set default 'equipe'/i.test(sql))
})

test("nenhum UPDATE de dados em profiles (só ALTER de schema)", () => {
  assert.ok(!/^\s*update\s+profiles/im.test(sql), "esta migration não deve fazer UPDATE de dados")
})

test("CHECK restringe papel a ('equipe','sem_papel')", () => {
  assert.match(sql, /add constraint profiles_papel_check\s*check \(papel in \('equipe', 'sem_papel'\)\)/i)
})

test("is_equipe(): SECURITY DEFINER, STABLE, LANGUAGE SQL, sem parâmetros, search_path=public", () => {
  assert.match(sql, /create or replace function public\.is_equipe\(\)\s*returns boolean/i)
  assert.match(sql, /language sql/i)
  assert.match(sql, /\bstable\b/i)
  assert.match(sql, /security definer/i)
  assert.match(sql, /set search_path = public/i)
  // garantindo que não há parâmetro entre os parênteses da assinatura
  assert.match(sql, /is_equipe\(\)\s*\n?\s*returns boolean/i)
})

test("is_equipe() consulta profiles por auth.uid() e papel = 'equipe'", () => {
  assert.match(sql, /where id = auth\.uid\(\) and papel = 'equipe'/i)
})

test("REVOKE ALL FROM PUBLIC e GRANT EXECUTE só para authenticated (nunca anon explicitamente)", () => {
  assert.match(sql, /revoke all on function public\.is_equipe\(\) from public\s*;/i)
  assert.match(sql, /grant execute on function public\.is_equipe\(\) to authenticated\s*;/i)
  assert.ok(!/grant execute on function public\.is_equipe\(\) to anon/i.test(sql))
})

const HARDENED_SELECT_POLICIES = [
  ["leads", "authenticated_select_leads"],
  ["leads_ficha", "authenticated_select_leads_ficha"],
  ["conversations", "authenticated_select_conversations"],
  ["answers", "authenticated_select_answers"],
  ["ai_analysis", "authenticated_select_ai_analysis"],
  ["whatsapp_messages", "authenticated_select_whatsapp_messages"],
  ["logs", "authenticated_select_logs"],
]

test("todas as policies SELECT de authenticated nas tabelas internas usam is_equipe()", () => {
  for (const [table, policy] of HARDENED_SELECT_POLICIES) {
    const dropRegex = new RegExp(`drop policy ${policy} on ${table}\\s*;`, "i")
    assert.match(sql, dropRegex, `esperava DROP POLICY ${policy} on ${table}`)
    const createRegex = new RegExp(
      `create policy ${policy} on ${table}\\s*for select to authenticated using \\(is_equipe\\(\\)\\)`,
      "i",
    )
    assert.match(sql, createRegex, `esperava CREATE POLICY ${policy} usando is_equipe()`)
  }
})

test("leads e leads_ficha: INSERT/UPDATE/DELETE também usam is_equipe()", () => {
  for (const table of ["leads", "leads_ficha"]) {
    assert.match(
      sql,
      new RegExp(`create policy authenticated_insert_${table} on ${table}\\s*for insert to authenticated with check \\(is_equipe\\(\\)\\)`, "i"),
    )
    assert.match(
      sql,
      new RegExp(
        `create policy authenticated_update_${table} on ${table}\\s*for update to authenticated using \\(is_equipe\\(\\)\\) with check \\(is_equipe\\(\\)\\)`,
        "i",
      ),
    )
    assert.match(
      sql,
      new RegExp(`create policy authenticated_delete_${table} on ${table}\\s*for delete to authenticated using \\(is_equipe\\(\\)\\)`, "i"),
    )
  }
})

test("conversations: UPDATE também usa is_equipe()", () => {
  assert.match(
    sql,
    /create policy authenticated_update_conversations on conversations\s*for update to authenticated using \(is_equipe\(\)\) with check \(is_equipe\(\)\)/i,
  )
})

test("settings e campaigns (ALL de authenticated) usam is_equipe() em USING e WITH CHECK", () => {
  assert.match(
    sql,
    /create policy authenticated_all_settings on settings\s*for all to authenticated using \(is_equipe\(\)\) with check \(is_equipe\(\)\)/i,
  )
  assert.match(
    sql,
    /create policy authenticated_all_campaigns on campaigns\s*for all to authenticated using \(is_equipe\(\)\) with check \(is_equipe\(\)\)/i,
  )
})

test("profiles: SELECT vira is_equipe() OR auth.uid()=id", () => {
  assert.match(
    sql,
    /create policy authenticated_select_profiles on profiles\s*for select to authenticated using \(is_equipe\(\) or auth\.uid\(\) = id\)/i,
  )
})

test("policies anon necessárias NÃO são tocadas (nenhum DROP sobre elas)", () => {
  const anonPolicies = ["anon_insert_conversations", "anon_insert_answers", "anon_insert_logs"]
  for (const p of anonPolicies) {
    assert.ok(!new RegExp(`drop policy ${p}`, "i").test(sql), `${p} não deveria ser tocada`)
    assert.ok(!new RegExp(`create policy ${p}`, "i").test(sql), `${p} não deveria ser recriada`)
  }
})

test("campaigns pública (public_select_campaigns) permanece intocada", () => {
  assert.ok(!/drop policy public_select_campaigns/i.test(sql))
  assert.ok(!/create policy public_select_campaigns/i.test(sql))
})

test("self_update_profile (a policy) não é tocada — a correção é por GRANT de coluna", () => {
  assert.ok(!/drop policy self_update_profile/i.test(sql))
  assert.ok(!/create policy self_update_profile/i.test(sql))
})

test("BLOQUEADOR: REVOKE UPDATE amplo + GRANT restrito a (nome, email) em profiles", () => {
  assert.match(sql, /revoke update on profiles from authenticated\s*;/i)
  assert.match(sql, /grant update \(nome, email\) on profiles to authenticated\s*;/i)
})

test("papel, id e created_at NUNCA aparecem na lista de colunas liberadas para UPDATE de authenticated", () => {
  const grantMatch = sql.match(/grant update \(([^)]*)\) on profiles to authenticated/i)
  assert.ok(grantMatch, "esperava um GRANT UPDATE (...) on profiles")
  const columns = grantMatch[1].split(",").map((c) => c.trim())
  assert.deepEqual(columns.sort(), ["email", "nome"])
  assert.ok(!columns.includes("papel"))
  assert.ok(!columns.includes("id"))
  assert.ok(!columns.includes("created_at"))
})

test("nenhuma instrução DDL desta migration opera sobre as tabelas de Embaixadoras", () => {
  // A coluna profiles.papel tem um `comment on column` que MENCIONA
  // "public.embaixadoras" em prosa (pra explicar que profiles não é a
  // identidade da Embaixadora) — isso é documentação legítima, não uma
  // alteração na tabela. O que importa é que nenhuma instrução real
  // (policy/grant/alter/drop/create) tenha essas tabelas como ALVO.
  const embaixadorasTables = ["embaixadoras", "indicacoes_embaixadoras", "recompensas_embaixadoras"]
  for (const table of embaixadorasTables) {
    assert.ok(!new RegExp(`\\bon ${table}\\b`, "i").test(sql), `nenhuma instrução deveria ter '${table}' como alvo`)
    assert.ok(!new RegExp(`alter table ${table}\\b`, "i").test(sql))
    assert.ok(!new RegExp(`grant[^;]*\\b${table}\\b`, "i").test(sql), `nenhum GRANT deveria mencionar '${table}'`)
  }
})

test("nenhuma policy criada nesta migration ainda usa 'true' cru para authenticated (todas passaram a usar is_equipe())", () => {
  const createdAuthenticatedPolicies = [
    ...sql.matchAll(/create policy \w+ on \w+\s*for \w+ to authenticated ([^;]*);/gi),
  ]
  assert.ok(createdAuthenticatedPolicies.length >= 12, "esperava pelo menos 12 policies recriadas para authenticated")
  for (const [, clause] of createdAuthenticatedPolicies) {
    assert.ok(!/\btrue\b/i.test(clause), `policy recriada não deveria conter 'true' cru: ${clause}`)
    assert.match(clause, /is_equipe\(\)/i)
  }
})

test("nenhum GRANT novo é dado a anon nesta migration", () => {
  const grantLines = sql.split(";").filter((s) => /^\s*grant/i.test(s.trim()))
  for (const line of grantLines) {
    assert.ok(!/\banon\b/i.test(line), `linha de GRANT não deveria mencionar anon: ${line.trim()}`)
  }
})

test("balanceamento estrutural: parênteses casados em cada statement", () => {
  const statements = sql.split(";").map((s) => s.trim()).filter(Boolean)
  assert.ok(statements.length >= 30, "esperava várias dezenas de instruções (DROP/CREATE POLICY, GRANT, etc.)")
  for (const [i, stmt] of statements.entries()) {
    const opens = (stmt.match(/\(/g) || []).length
    const closes = (stmt.match(/\)/g) || []).length
    assert.equal(opens, closes, `statement #${i} com parênteses desbalanceados: ${stmt.slice(0, 80)}`)
  }
})
