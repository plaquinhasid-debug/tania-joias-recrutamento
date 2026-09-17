// IMPLEMENTATION-EMBAIXADORAS-E2.9 — lógica pura (sem React/AuthContext) de
// busca/parsing das indicações da Embaixadora autenticada atual, via a
// Edge Function dedicada `get-my-indicacoes`. Mesmo padrão de
// `lib/myEmbaixadora.ts`: nunca importa `@/context/AuthContext` (um
// `.tsx`), o que permite testar `fetchMinhasIndicacoes`/
// `parseMinhasIndicacoes` direto via node:test sem precisar de React/DOM.
import { FunctionsHttpError } from "@supabase/supabase-js"

import { supabase } from "@/lib/supabase"

export type SituacaoIndicacao = "em_analise" | "aprovada" | "nao_aprovada"

export interface IndicacaoItem {
  nome: string
  situacao: SituacaoIndicacao
  indicada_em: string
}

export interface MinhasIndicacoes {
  total: number
  indicacoes: IndicacaoItem[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isSituacaoIndicacao(value: unknown): value is SituacaoIndicacao {
  return value === "em_analise" || value === "aprovada" || value === "nao_aprovada"
}

function parseIndicacaoItem(value: unknown): IndicacaoItem | null {
  if (
    !isRecord(value) ||
    typeof value.nome !== "string" || !value.nome ||
    typeof value.indicada_em !== "string" || !value.indicada_em ||
    !isSituacaoIndicacao(value.situacao)
  ) {
    return null
  }
  return { nome: value.nome, situacao: value.situacao, indicada_em: value.indicada_em }
}

/**
 * Projeta só o contrato mínimo — nunca repassa campos extras que viessem na
 * resposta (mesmo espírito de `parseMinhaEmbaixadora` em lib/myEmbaixadora.ts).
 * Resposta malformada, ou qualquer item individual malformado, é descartado
 * silenciosamente (nunca lança) — o Portal deve continuar funcionando mesmo
 * que um item futuro venha inesperado.
 */
export function parseMinhasIndicacoes(value: unknown): MinhasIndicacoes | null {
  if (!isRecord(value) || typeof value.total !== "number" || !Array.isArray(value.indicacoes)) {
    return null
  }
  const indicacoes: IndicacaoItem[] = []
  for (const raw of value.indicacoes) {
    const item = parseIndicacaoItem(raw)
    if (item) indicacoes.push(item)
  }
  return { total: value.total, indicacoes }
}

type FunctionsInvoke = typeof supabase.functions.invoke

/**
 * `404` (embaixadora_nao_encontrada) vira `{ total: 0, indicacoes: [] }` —
 * mesmo espírito de `fetchMinhaEmbaixadora` tratar 404 como "sem Portal",
 * nunca como erro. Na prática este caminho não deveria ser exercitado no
 * Portal (a rota já exige Embaixadora ativa antes de chegar aqui), mas
 * mantém o mesmo comportamento defensivo caso o status mude entre o
 * carregamento da identidade e desta chamada. Qualquer outro erro HTTP
 * (401/403/500) ou falha de rede propaga (throw) de verdade.
 */
export async function fetchMinhasIndicacoes(
  invoke: FunctionsInvoke = supabase.functions.invoke.bind(supabase.functions),
): Promise<MinhasIndicacoes> {
  const { data, error } = await invoke<unknown>("get-my-indicacoes", { method: "GET" })
  if (error) {
    if (error instanceof FunctionsHttpError && error.context instanceof Response && error.context.status === 404) {
      return { total: 0, indicacoes: [] }
    }
    throw error
  }
  return parseMinhasIndicacoes(data) ?? { total: 0, indicacoes: [] }
}
