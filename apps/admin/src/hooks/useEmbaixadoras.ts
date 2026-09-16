// IMPLEMENTATION-EMBAIXADORAS-E2.3-E — listagem administrativa de
// Embaixadoras. Nunca lê `public.embaixadoras` direto (authenticated não
// tem — nem deveria ter — acesso via PostgREST, ver auditoria E2.3-A/E2.3-C)
// — sempre via a Edge Function dedicada `list-ambassadors-admin`, que já
// valida `getUser(jwt)` + `is_equipe()` e usa service_role só no servidor.
//
// Autorização: nenhuma manipulação manual de JWT aqui — `supabase.functions.invoke`
// já anexa a sessão ativa do client normal (mesmo client usado por
// AuthContext), exatamente como o resto do Admin já faz pra tabelas comuns.
import { useQuery } from "@tanstack/react-query"

import { supabase } from "@/lib/supabase"

export type EmbaixadoraStatus = "convidada" | "ativa" | "inativa" | "rejeitada"

/**
 * Tipo local estreito — não é o schema completo de `public.embaixadoras`
 * (que tem colunas sensíveis como `invite_token_hash`), só os 9 campos que
 * `list-ambassadors-admin` devolve (ver auditoria E2.3-A, seção G). Local de
 * propósito: `packages/shared/src/database.types.ts` não tem `embaixadoras`
 * nem `Functions` (desatualizado desde antes dessas features existirem —
 * achado da E2.2-D.0-B/E2.3-B) e não deve ser regenerado nesta rodada.
 */
export interface EmbaixadoraAdmin {
  id: string
  nome: string
  telefone_normalizado: string
  email: string
  instagram: string | null
  codigo_referral: string
  status: EmbaixadoraStatus
  created_at: string
  aprovada_em: string | null
}

interface ListAmbassadorsAdminResponse {
  embaixadoras: EmbaixadoraAdmin[]
}

type FunctionsInvoke = typeof supabase.functions.invoke

/**
 * `invoke` injetável só pra teste (mesmo padrão de `sendFichaWhatsapp` em
 * `useLeadFicha.ts`) — em produção sempre o client real.
 *
 * `method: "GET"` é OBRIGATÓRIO aqui — confirmado por leitura do source real
 * de `@supabase/functions-js` (`FunctionsClient.ts`): sem essa opção
 * explícita, o SDK usa `method: method || 'POST'` como default. A Edge
 * Function `list-ambassadors-admin` publicada só aceita GET/OPTIONS — um
 * POST implícito receberia 405 (ou, com verify_jwt, seria barrado antes
 * mesmo de chegar no handler). Nunca assumir POST silenciosamente aqui.
 *
 * Erro nunca é engolido: `if (error) throw` deixa o React Query tratar como
 * falha de query — a página reage com `ErrorState` + retry.
 */
export async function fetchEmbaixadoras(
  invoke: FunctionsInvoke = supabase.functions.invoke.bind(supabase.functions),
): Promise<EmbaixadoraAdmin[]> {
  const { data, error } = await invoke<ListAmbassadorsAdminResponse>("list-ambassadors-admin", {
    method: "GET",
  })
  if (error) throw error
  return data?.embaixadoras ?? []
}

export function useEmbaixadoras() {
  return useQuery({
    queryKey: ["embaixadoras"],
    queryFn: () => fetchEmbaixadoras(),
    // Mesmo espírito de outras listagens do Admin (ex.: useSettings.ts) —
    // sem polling, sem refetch agressivo. `refetchOnWindowFocus` já é
    // `false` globalmente (ver main.tsx).
    staleTime: 30_000,
  })
}
