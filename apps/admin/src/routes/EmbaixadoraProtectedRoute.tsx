import * as React from "react"
import { Navigate, Outlet, useLocation } from "react-router-dom"

import { useAuth } from "@/context/AuthContext"
import { useMyEmbaixadora } from "@/hooks/useMyEmbaixadora"
import { resolveEmbaixadoraRouteState } from "@/lib/embaixadoraRouteState"
import { ErrorState } from "@/components/common/ErrorState"

// IMPLEMENTATION-EMBAIXADORAS-E2.7-B — guard DEDICADO ao Portal da
// Embaixadora, isolado de `ProtectedRoute.tsx` (equipe) de propósito: os
// dois nunca compartilham lógica de decisão, mesmo sendo estruturalmente
// parecidos (mesmo espírito de create-ambassador-invite/list-ambassadors-admin
// duplicarem `authorize()` em vez de importar um do outro). Isso garante
// que uma mudança num guard nunca afeta o outro por acidente.
//
// Este componente é só defesa de UX/superfície (evita flash do Portal pra
// quem não tem Embaixadora ativa vinculada). A segurança real continua no
// banco/Edge Function — `get-my-embaixadora` sempre filtra por
// `user_id = auth.uid()` e só devolve dado com `status='ativa'`. Nunca
// tratar isto como a fronteira de segurança de verdade.

function BlockingSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="size-8 animate-spin rounded-full border-2 border-border border-t-gold" />
    </div>
  )
}

export function EmbaixadoraProtectedRoute() {
  const { session, loading, signOut } = useAuth()
  const location = useLocation()
  const minhaEmbaixadoraQuery = useMyEmbaixadora()

  const state = resolveEmbaixadoraRouteState({
    sessionLoading: loading,
    hasSession: !!session,
    lookupLoading: minhaEmbaixadoraQuery.isLoading,
    lookupError: minhaEmbaixadoraQuery.error,
    minhaEmbaixadora: minhaEmbaixadoraQuery.data,
  })

  // "forbidden" exige um signOut real — mesmo padrão de ProtectedRoute.tsx
  // (equipe): efeito colateral, nunca disparado durante o render. Cobre
  // tanto "conta de equipe navegou direto pra /portal-embaixadora" quanto
  // "conta sem vínculo nenhum" — em ambos os casos, nunca fica logada
  // olhando pro Portal.
  const forcedSignOutRef = React.useRef(false)

  React.useEffect(() => {
    if (state !== "forbidden" || forcedSignOutRef.current) return
    forcedSignOutRef.current = true
    void signOut()
  }, [state, signOut])

  if (state === "session-loading" || state === "lookup-loading" || state === "forbidden") {
    return <BlockingSpinner />
  }

  if (state === "unauthenticated") {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: location,
          message: forcedSignOutRef.current ? "Acesso não autorizado." : undefined,
        }}
      />
    )
  }

  if (state === "lookup-error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <ErrorState
          title="Não foi possível verificar seu acesso"
          description="Tente novamente."
          onRetry={() => void minhaEmbaixadoraQuery.refetch()}
        />
      </div>
    )
  }

  // state === "authorized"
  return <Outlet />
}
