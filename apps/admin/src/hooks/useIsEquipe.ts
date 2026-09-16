// IMPLEMENTATION-EMBAIXADORAS-E2.2-D.0-B — checa se o usuário logado é
// equipe, via a RPC real `public.is_equipe()` (ver auditoria E2.2-D.0-A,
// seção D: SECURITY DEFINER, search_path fixo, EXECUTE só pra
// authenticated/service_role, nunca anon).
import { useQuery } from "@tanstack/react-query"
import type { SupabaseClient } from "@supabase/supabase-js"

import { supabase } from "@/lib/supabase"
import { useAuth } from "@/context/AuthContext"

// `is_equipe()` já existe de verdade no banco, mas
// `packages/shared/src/database.types.ts` tem `Functions: {[_ in never]:
// never}` — o arquivo de tipos gerado está desatualizado desde antes desta
// função existir (pré-existente, não introduzido aqui; regenerá-lo tocaria
// um pacote compartilhado inteiro com um diff grande e não relacionado a
// esta rodada). Cast local e explícito pro client sem o generic `Database`
// (que volta a aceitar qualquer nome de função) só nesta chamada — por
// isso o retorno é validado manualmente logo abaixo, em vez de confiar no
// tipo gerado.
const untypedSupabase = supabase as unknown as SupabaseClient

async function fetchIsEquipe(): Promise<boolean> {
  const { data, error } = await untypedSupabase.rpc("is_equipe")
  if (error) throw error
  if (typeof data !== "boolean") {
    throw new Error("is_equipe() retornou um valor inesperado (esperava boolean)")
  }
  return data
}

/**
 * `enabled: !!session` — nunca chama a RPC sem sessão (anon não tem
 * EXECUTE em is_equipe() mesmo, mas nem vale a pena tentar).
 * `queryKey` inclui `session.user.id` — troca de usuário (logout + login
 * com outra conta) automaticamente descarta o resultado antigo e busca de
 * novo, sem cache manual paralelo.
 * `staleTime: Infinity` — papel de equipe muda raramente e só por ação
 * manual direta no banco; não vale revalidar em todo focus/remount. Se um
 * dia isso mudar com mais frequência, revisitar este valor.
 */
export function useIsEquipe() {
  const { session } = useAuth()

  return useQuery({
    queryKey: ["auth", "is-equipe", session?.user?.id],
    queryFn: fetchIsEquipe,
    enabled: !!session,
    staleTime: Infinity,
    retry: 1,
  })
}
