import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

// -----------------------------------------------------------------------
// EMBAIXADORAS TANIA JOIAS V1 — E1-A. Testes ESTÁTICOS (leitura de texto
// do arquivo .sql, sem conexão nenhuma com banco — a migration NÃO é
// aplicada em lugar nenhum aqui, local ou remoto). Garantem só o
// contrato/formato da migration em si.
// -----------------------------------------------------------------------

const MIGRATION_PATH = "../supabase/migrations/20260915180000_add_embaixadoras_v1_schema.sql"
const rawSql = fs.readFileSync(new URL(MIGRATION_PATH, import.meta.url), "utf8")

// Todo o arquivo usa comentários de linha (`-- ...`), nunca `--` dentro de
// uma string/valor de verdade — então remover tudo depois de `--` em cada
// linha isola só o SQL executável, sem os comentários explicativos (que
// mencionam nomes de tabela livremente em prosa e não devem contar como
// "a migration toca nesta tabela"). Todas as asserções abaixo rodam sobre
// este `sql` (código real), não sobre o texto bruto com comentários.
const sql = rawSql.replace(/--.*$/gm, "")

const NEW_TABLES = ["embaixadoras", "indicacoes_embaixadoras", "recompensas_embaixadoras"]
const EXISTING_TABLES = ["leads", "leads_ficha", "conversations", "answers", "profiles", "settings", "campaigns"]

test("migration cria exatamente as 3 tabelas esperadas, nenhuma a mais", () => {
  const created = [...sql.matchAll(/^create table (\w+)/gim)].map((m) => m[1])
  assert.deepEqual(created.sort(), [...NEW_TABLES].sort())
})

test("nenhuma tabela existente é alterada (nenhum ALTER TABLE aponta pra elas)", () => {
  const altered = [...sql.matchAll(/alter table (?:public\.)?(\w+)/gim)].map((m) => m[1])
  for (const existing of EXISTING_TABLES) {
    assert.ok(
      !altered.includes(existing),
      `ALTER TABLE não deveria tocar em '${existing}' nesta migration`,
    )
  }
  // As únicas ocorrências de ALTER TABLE devem ser nas 3 tabelas novas
  // (enable row level security).
  for (const alteredTable of altered) {
    assert.ok(
      NEW_TABLES.includes(alteredTable),
      `ALTER TABLE inesperado em '${alteredTable}' — só as 3 tabelas novas deveriam aparecer aqui`,
    )
  }
})

test("nenhuma tabela existente recebe CREATE TRIGGER/CREATE INDEX/REVOKE desta migration", () => {
  for (const existing of EXISTING_TABLES) {
    const onExistingTable = new RegExp(`\\bon ${existing}\\b`, "i")
    assert.ok(
      !onExistingTable.test(sql),
      `Não deveria haver 'on ${existing}' (trigger/index/revoke) nesta migration`,
    )
  }
})

test("nenhuma policy é criada (zero CREATE POLICY) — mesmo padrão de whatsapp_contacts", () => {
  assert.ok(!/create policy/i.test(sql), "esta migration não deve criar nenhuma policy")
})

test("nenhum resquício de policy permissiva qual=true / USING(true) / WITH CHECK(true)", () => {
  assert.ok(!/using\s*\(\s*true\s*\)/i.test(sql))
  assert.ok(!/with check\s*\(\s*true\s*\)/i.test(sql))
})

test("RLS habilitada nas 3 tabelas novas, e só nelas", () => {
  const rlsEnabledFor = [...sql.matchAll(/alter table (\w+) enable row level security/gim)].map(
    (m) => m[1],
  )
  assert.deepEqual(rlsEnabledFor.sort(), [...NEW_TABLES].sort())
})

test("REVOKE explícito de anon/authenticated nas 3 tabelas novas, service_role nunca revogado", () => {
  for (const table of NEW_TABLES) {
    const revokeRegex = new RegExp(`revoke all on ${table} from anon, authenticated`, "i")
    assert.ok(revokeRegex.test(sql), `esperava REVOKE ALL ... FROM anon, authenticated em '${table}'`)
  }
  const revokeLines = sql.split("\n").filter((line) => /^\s*revoke/i.test(line))
  for (const line of revokeLines) {
    assert.ok(!/service_role/i.test(line), `linha de REVOKE não deveria mencionar service_role: "${line.trim()}"`)
  }
})

test("recompensas_embaixadoras NUNCA contém o estado 'pendente'", () => {
  assert.ok(!/'pendente'/i.test(sql), "não deve existir status 'pendente' em nenhuma tabela nova")
})

test("valor_centavos: default 4000, sem ponto flutuante", () => {
  assert.match(sql, /valor_centavos integer not null default 4000/i)
  assert.ok(!/valor_reais|numeric\(|float|double precision/i.test(sql))
})

test("UNIQUEs críticas estão presentes (uma por linha de coluna)", () => {
  const expectedUniqueFragments = [
    "telefone_normalizado text not null unique",
    "codigo_referral text not null unique",
    "invite_token uuid not null unique",
    "user_id uuid unique references auth.users",
    "candidata_telefone_normalizado text not null unique",
    "lead_id uuid unique references leads",
    "indicacao_id uuid not null unique references indicacoes_embaixadoras",
    "evento_origem_id text unique",
  ]
  for (const fragment of expectedUniqueFragments) {
    assert.ok(sql.includes(fragment), `esperava encontrar o fragmento: "${fragment}"`)
  }
})

test("nenhuma coluna de chave PIX é criada nesta E1", () => {
  assert.ok(!/chave_pix/i.test(sql))
  assert.ok(!/tipo_chave_pix/i.test(sql))
})

test("nenhum ON DELETE CASCADE é usado (histórico financeiro nunca some em cascata)", () => {
  assert.ok(!/on delete cascade/i.test(sql))
})

test("as chaves estrangeiras 'de linhagem' (que não podem sumir) usam ON DELETE RESTRICT", () => {
  const restrictFks = [...sql.matchAll(/references \w+\(id\) on delete restrict/gi)]
  // indicacoes_embaixadoras.embaixadora_id, recompensas_embaixadoras.indicacao_id
  assert.equal(restrictFks.length, 2, "esperava exatamente 2 FKs com ON DELETE RESTRICT")
})

test("recompensas_embaixadoras NÃO possui coluna embaixadora_id — Embaixadora só via indicacao_id", () => {
  const tableBlockMatch = sql.match(/create table recompensas_embaixadoras \(([\s\S]*?)\n\);/i)
  assert.ok(tableBlockMatch, "não consegui isolar o bloco CREATE TABLE de recompensas_embaixadoras")
  const tableBody = tableBlockMatch[1]

  assert.ok(
    !/\bembaixadora_id\b/i.test(tableBody),
    "recompensas_embaixadoras não deve ter coluna embaixadora_id — a Embaixadora é obtida via indicacao_id -> indicacoes_embaixadoras.embaixadora_id",
  )
  assert.ok(
    !/references embaixadoras\(id\)/i.test(tableBody),
    "recompensas_embaixadoras não deve referenciar embaixadoras(id) diretamente",
  )
  assert.match(
    tableBody,
    /indicacao_id uuid not null unique references indicacoes_embaixadoras\(id\) on delete restrict/i,
    "recompensas_embaixadoras deve continuar apontando pra Embaixadora só indiretamente, via indicacao_id",
  )

  // Nenhuma alternativa proibida (trigger de sincronização, generated
  // column ou view) foi usada pra repor a coluna removida.
  assert.ok(!/create (or replace )?view/i.test(sql))
  assert.ok(!/generated always/i.test(sql))
  assert.ok(
    !/create trigger[\s\S]*?recompensas_embaixadoras[\s\S]*?embaixadora_id/i.test(sql),
    "não deve existir trigger de sincronização de embaixadora_id em recompensas_embaixadoras",
  )
})

test("nenhum índice remanescente em recompensas_embaixadoras(embaixadora_id)", () => {
  assert.ok(!/recompensas_embaixadoras_embaixadora_id_idx/i.test(sql))
  assert.ok(!/create index[^;]*on recompensas_embaixadoras\(embaixadora_id\)/i.test(sql))
})

test("colunas de 'ator' (quem aprovou/invalidou/pagou/cancelou) usam ON DELETE SET NULL para profiles", () => {
  const setNullToProfiles = [...sql.matchAll(/references profiles\(id\) on delete set null/gi)]
  // aprovada_por, invalidada_por, pago_por, cancelada_por
  assert.equal(setNullToProfiles.length, 4)
})

test("reaproveita a função set_updated_at existente — não cria uma segunda função", () => {
  assert.ok(!/create (or replace )?function/i.test(sql), "não deveria criar função nova nesta migration")
  const triggers = [...sql.matchAll(/execute function set_updated_at\(\)/gi)]
  assert.equal(triggers.length, 3, "esperava 1 trigger de updated_at por tabela nova (3 no total)")
})

test("não cria/altera a tabela de conversas do Sofia (coluna de referral pertence à E3 futura)", () => {
  assert.ok(!/\bconversations\b/i.test(sql), "esta migration não deve tocar em 'conversations' de forma alguma")
})

test("CHECK estrutural de telefone segue o formato canônico da E0 (55 + 10 ou 11 dígitos)", () => {
  const phoneChecks = [...sql.matchAll(/check \(\w+ ~ '\^55\[0-9\]\{10,11\}\$'\)/gi)]
  assert.equal(phoneChecks.length, 2, "esperava o mesmo CHECK de formato em telefone_normalizado e candidata_telefone_normalizado")
})
