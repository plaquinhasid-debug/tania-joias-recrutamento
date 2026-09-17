// IMPLEMENTATION-EMBAIXADORAS-E2.7-B — hook React do Portal Mínimo. A
// lógica pura (fetch/parse) mora em `@/lib/myEmbaixadora.ts` (sem
// dependência de AuthContext/.tsx, testável isolada) — este arquivo só
// conecta essa lógica ao React Query + à sessão atual, mesmo padrão de
// `hooks/useIsEquipe.ts`.
import { useQuery } from "@tanstack/react-query"

import { useAuth } from "@/context/AuthContext"
import { fetchMinhaEmbaixadora } from "@/lib/myEmbaixadora"

export type { EmbaixadoraStatus, MinhaEmbaixadora } from "@/lib/myEmbaixadora"

/**
 * `queryKey` inclui `session.user.id` — troca de usuário descarta o
 * resultado antigo automaticamente, mesmo padrão de useIsEquipe.ts.
 * `staleTime` curto (não `Infinity` como is-equipe): status de Embaixadora
 * pode mudar mais cedo na vida do produto (ex.: ficar inativa) do que papel
 * de equipe.
 */
export function useMyEmbaixadora() {
  const { session } = useAuth()

  return useQuery({
    queryKey: ["auth", "my-embaixadora", session?.user?.id],
    queryFn: () => fetchMinhaEmbaixadora(),
    enabled: !!session,
    staleTime: 30_000,
    retry: 1,
  })
}
