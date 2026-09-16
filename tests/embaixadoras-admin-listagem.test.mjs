import test from "node:test"
import assert from "node:assert/strict"

import { fetchEmbaixadoras } from "../apps/admin/src/hooks/useEmbaixadoras.ts"
import { formatInstagram, formatTelefoneNormalizado } from "../apps/admin/src/lib/format.ts"

// -----------------------------------------------------------------------
// IMPLEMENTATION-EMBAIXADORAS-E2.3-E — testes da integração Admin com
// `list-ambassadors-admin`. Todos com `invoke` mockado (injeção, mesmo
// padrão de `sendFichaWhatsapp` em `useLeadFicha.ts`) — NENHUMA chamada de
// rede real, NENHUMA conexão com Supabase.
// -----------------------------------------------------------------------

const SAMPLE_EMBAIXADORA = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  nome: "Maria Teste",
  telefone_normalizado: "5511999999999",
  email: "maria@email.com",
  instagram: "maria.revende",
  codigo_referral: "ABCD2345",
  status: "convidada",
  created_at: "2026-09-16T10:00:00.000Z",
  aprovada_em: null,
}

/** Spy de `supabase.functions.invoke` — grava os argumentos exatos recebidos. */
function makeInvokeSpy(response) {
  const calls = []
  const invoke = async (functionName, options) => {
    calls.push({ functionName, options })
    return response
  }
  return { invoke, calls }
}

for (const [input, expected] of [
  [null, "—"],
  [undefined, "—"],
  ["", "—"],
  ["usuario", "@usuario"],
  ["@usuario", "@usuario"],
  ["  usuario  ", "@usuario"],
  ["  @usuario  ", "@usuario"],
  ["@@usuario", "@usuario"],
  ["   ", "—"],
  ["@@", "—"],
  ["  @@Maria.Revende_123  ", "@Maria.Revende_123"],
]) {
  test(`INSTAGRAM: ${JSON.stringify(input)} -> ${expected}`, () => {
    assert.equal(formatInstagram(input), expected)
  })
}

test("INSTAGRAM: apresentação aceita formatos mistos da listagem sem alterar os dados recebidos", async () => {
  const rows = ["usuario", "@usuario", "  @@usuario  "].map((instagram) => ({
    ...SAMPLE_EMBAIXADORA,
    instagram,
  }))
  const { invoke } = makeInvokeSpy({ data: { embaixadoras: rows }, error: null })
  const result = await fetchEmbaixadoras(invoke)
  assert.deepEqual(result.map((row) => formatInstagram(row.instagram)), ["@usuario", "@usuario", "@usuario"])
  assert.deepEqual(rows.map((row) => row.instagram), ["usuario", "@usuario", "  @@usuario  "])
})

// =========================================================================
// A/D — MÉTODO GET (o teste mais crítico desta rodada: a Edge Function
// publicada rejeita/barra tudo que não seja GET/OPTIONS — supabase-js usa
// POST como default quando `method` não é passado, confirmado lendo
// node_modules/@supabase/functions-js/src/FunctionsClient.ts linha 285:
// `method: method || 'POST'`.)
// =========================================================================

test("MÉTODO: fetchEmbaixadoras chama invoke com method: 'GET' explícito (nunca confia no default POST do SDK)", async () => {
  const { invoke, calls } = makeInvokeSpy({ data: { embaixadoras: [] }, error: null })
  await fetchEmbaixadoras(invoke)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].functionName, "list-ambassadors-admin")
  assert.equal(calls[0].options.method, "GET")
})

test("MÉTODO: nenhuma outra opção de method (POST/PUT/PATCH/DELETE) é usada", async () => {
  const { invoke, calls } = makeInvokeSpy({ data: { embaixadoras: [] }, error: null })
  await fetchEmbaixadoras(invoke)
  assert.notEqual(calls[0].options.method, "POST")
  assert.notEqual(calls[0].options.method, undefined, "method não pode ficar undefined — o SDK cairia no default POST")
})

// =========================================================================
// B — BASE VAZIA
// =========================================================================

test("LISTAGEM: base vazia -> []", async () => {
  const { invoke } = makeInvokeSpy({ data: { embaixadoras: [] }, error: null })
  const result = await fetchEmbaixadoras(invoke)
  assert.deepEqual(result, [])
})

test("LISTAGEM: data null (resposta inesperada) -> [] em vez de lançar/quebrar", async () => {
  const { invoke } = makeInvokeSpy({ data: null, error: null })
  const result = await fetchEmbaixadoras(invoke)
  assert.deepEqual(result, [])
})

// =========================================================================
// A — TRANSFORMAÇÃO/VALIDAÇÃO DA RESPOSTA
// =========================================================================

test("LISTAGEM: uma Embaixadora -> devolvida exatamente como veio (a sanitização é responsabilidade do backend, já auditado)", async () => {
  const { invoke } = makeInvokeSpy({ data: { embaixadoras: [SAMPLE_EMBAIXADORA] }, error: null })
  const result = await fetchEmbaixadoras(invoke)
  assert.equal(result.length, 1)
  assert.deepEqual(result[0], SAMPLE_EMBAIXADORA)
})

test("LISTAGEM: múltiplas Embaixadoras -> todas devolvidas, na ordem recebida", async () => {
  const rows = [
    { ...SAMPLE_EMBAIXADORA, id: "id-1", nome: "Primeira" },
    { ...SAMPLE_EMBAIXADORA, id: "id-2", nome: "Segunda" },
  ]
  const { invoke } = makeInvokeSpy({ data: { embaixadoras: rows }, error: null })
  const result = await fetchEmbaixadoras(invoke)
  assert.deepEqual(result.map((e) => e.id), ["id-1", "id-2"])
})

// =========================================================================
// C — ERRO NUNCA É ENGOLIDO
// =========================================================================

test("ERRO: invoke retornando error -> fetchEmbaixadoras propaga (throw), nunca devolve [] silenciosamente", async () => {
  const erroSintetico = new Error("FunctionsHttpError sintético de teste")
  const { invoke } = makeInvokeSpy({ data: null, error: erroSintetico })
  await assert.rejects(() => fetchEmbaixadoras(invoke), erroSintetico)
})

// =========================================================================
// E — MAPEAMENTO DOS 4 STATUS (via EmbaixadoraStatusBadge)
// =========================================================================

test("STATUS: os 4 valores reais de embaixadora_status_enum são aceitos pelo tipo local (compilação já garante isso; aqui confirmamos que passam intactos pela função de fetch)", async () => {
  for (const status of ["convidada", "ativa", "inativa", "rejeitada"]) {
    const { invoke } = makeInvokeSpy({
      data: { embaixadoras: [{ ...SAMPLE_EMBAIXADORA, status }] },
      error: null,
    })
    const result = await fetchEmbaixadoras(invoke)
    assert.equal(result[0].status, status)
  }
})

// =========================================================================
// F — FORMATAÇÃO DE TELEFONE (nova função pura, packages/shared/src/phone.ts intocado)
// =========================================================================

test("TELEFONE: celular normalizado (13 dígitos, DDI 55 + 9 dígitos locais) -> formatado com DDD e hífen", () => {
  assert.equal(formatTelefoneNormalizado("5511999999999"), "(11) 99999-9999")
})

test("TELEFONE: fixo normalizado (12 dígitos, DDI 55 + 8 dígitos locais) -> formatado com DDD e hífen", () => {
  assert.equal(formatTelefoneNormalizado("551133334444"), "(11) 3333-4444")
})

test("TELEFONE: DDD de 2 dígitos com celular de RS (bug histórico do DDI — ver E0) continua formatando certo", () => {
  assert.equal(formatTelefoneNormalizado("5555988887777"), "(55) 98888-7777")
})

test("TELEFONE: valor nulo/vazio -> travessão, nunca lança exceção", () => {
  assert.equal(formatTelefoneNormalizado(null), "—")
  assert.equal(formatTelefoneNormalizado(undefined), "—")
  assert.equal(formatTelefoneNormalizado(""), "—")
})

test("TELEFONE: valor sem o prefixo 55 (formato inesperado) -> devolve o valor original, não inventa formatação errada", () => {
  assert.equal(formatTelefoneNormalizado("11999999999"), "11999999999")
})

// =========================================================================
// G — CAMPOS INESPERADOS: a defesa em profundidade vive no backend
// (list-ambassadors-admin, já auditado na E2.3-C — projeção explícita em
// logic.ts). O frontend não reprojeta os campos porque confiaria em
// duplicar essa mesma garantia — mas confirmamos aqui que fetchEmbaixadoras
// não ADICIONA nada além do que veio na resposta (não há enriquecimento
// client-side que pudesse introduzir um campo por engano).
// =========================================================================

test("SEM ENRIQUECIMENTO CLIENT-SIDE: fetchEmbaixadoras nunca adiciona campos além dos que vieram na resposta", async () => {
  const { invoke } = makeInvokeSpy({ data: { embaixadoras: [SAMPLE_EMBAIXADORA] }, error: null })
  const result = await fetchEmbaixadoras(invoke)
  assert.deepEqual(Object.keys(result[0]).sort(), Object.keys(SAMPLE_EMBAIXADORA).sort())
})

test("SE o backend algum dia vazar um campo sensível por engano, fetchEmbaixadoras não filtra (não é sua responsabilidade) — documentado, não uma falha desta camada", async () => {
  const rowComExtraHipotetico = { ...SAMPLE_EMBAIXADORA, invite_token_hash: "nao-deveria-vir-do-backend" }
  const { invoke } = makeInvokeSpy({ data: { embaixadoras: [rowComExtraHipotetico] }, error: null })
  const result = await fetchEmbaixadoras(invoke)
  // Este teste documenta a fronteira de responsabilidade: a garantia real
  // está em list-ambassadors-admin/logic.ts (já testada e auditada
  // separadamente), não duplicada aqui.
  assert.ok("invite_token_hash" in result[0], "confirma que o frontend não faz projeção própria — a garantia é 100% do backend")
})
