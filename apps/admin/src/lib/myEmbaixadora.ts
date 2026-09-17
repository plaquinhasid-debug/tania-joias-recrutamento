// IMPLEMENTATION-EMBAIXADORAS-E2.7-B — lógica pura (sem React/AuthContext)
// de busca/parsing da Embaixadora vinculada ao usuário autenticado atual,
// via a Edge Function dedicada `get-my-embaixadora`. Separada de
// `hooks/useMyEmbaixadora.ts` de propósito: este arquivo nunca importa
// `@/context/AuthContext` (um `.tsx`), o que permite testar
// `fetchMinhaEmbaixadora`/`parseMinhaEmbaixadora` direto via node:test sem
// precisar de React/DOM — mesmo motivo de `lib/ambassadorInvite.ts` manter
// a lógica pura separada dos hooks em `hooks/useCreateAmbassadorInvite.ts`/
// `hooks/useResendAmbassadorInvite.ts`.
//
// `null` NÃO é erro: é o resultado normal pra uma conta de equipe, ou
// qualquer conta autenticada sem uma Embaixadora `ativa` vinculada — a
// function devolve 404 genérico pra esse caso, nunca diferenciando o
// motivo real (ver get-my-embaixadora/handler.ts).
import { FunctionsHttpError } from "@supabase/supabase-js"

import { supabase } from "@/lib/supabase"

export type EmbaixadoraStatus = "convidada" | "ativa" | "inativa" | "rejeitada"

export interface MinhaEmbaixadora {
  nome: string
  status: EmbaixadoraStatus
  codigo_referral: string
}

type FunctionsInvoke = typeof supabase.functions.invoke

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Projeta só o contrato mínimo — nunca repassa campos extras que viessem na resposta (mesmo espírito de parseInviteResult em lib/ambassadorInvite.ts). Resposta malformada -> null, nunca lança (tratada como "sem Portal", nunca como erro de rede). */
export function parseMinhaEmbaixadora(value: unknown): MinhaEmbaixadora | null {
  if (
    !isRecord(value) ||
    typeof value.nome !== "string" || !value.nome ||
    typeof value.codigo_referral !== "string" || !value.codigo_referral ||
    (value.status !== "convidada" && value.status !== "ativa" && value.status !== "inativa" && value.status !== "rejeitada")
  ) {
    return null
  }
  return { nome: value.nome, status: value.status, codigo_referral: value.codigo_referral }
}

/**
 * `404` (embaixadora_nao_encontrada) vira `null` — caminho NORMAL, nunca
 * propagado como erro. Qualquer outro erro HTTP (401/403/500) ou falha de
 * rede propaga (throw) de verdade — React Query trata como falha real,
 * mesma disciplina de fetchEmbaixadoras em useEmbaixadoras.ts.
 */
export async function fetchMinhaEmbaixadora(
  invoke: FunctionsInvoke = supabase.functions.invoke.bind(supabase.functions),
): Promise<MinhaEmbaixadora | null> {
  const { data, error } = await invoke<unknown>("get-my-embaixadora", { method: "GET" })
  if (error) {
    if (error instanceof FunctionsHttpError && error.context instanceof Response && error.context.status === 404) {
      return null
    }
    throw error
  }
  return parseMinhaEmbaixadora(data)
}
