import * as React from "react"
import { Navigate, Outlet, useLocation } from "react-router-dom"

import { useAuth } from "@/context/AuthContext"
import { useIsEquipe } from "@/hooks/useIsEquipe"
import { resolveProtectedRouteState } from "@/lib/protectedRouteState"
import { ErrorState } from "@/components/common/ErrorState"

// IMPLEMENTATION-EMBAIXADORAS-E2.2-D.0-B — ver auditoria E2.2-D.0-A: este
// componente é só defesa de UX/superfície (evita flash do Admin pra quem
// não é equipe). A segurança real continua no banco — RLS + is_equipe()
// SECURITY DEFINER + JWT validado server-side. Nunca tratar isto como a
// fronteira de segurança de verdade.

function BlockingSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="size-8 animate-spin rounded-full border-2 border-border border-t-gold" />
    </div>
  )
}

export function ProtectedRoute() {
  const { session, loading, signOut } = useAuth()
  const location = useLocation()
  const isEquipeQuery = useIsEquipe()

  const state = resolveProtectedRouteState({
    sessionLoading: loading,
    hasSession: !!session,
    isEquipeLoading: isEquipeQuery.isLoading,
    isEquipeError: isEquipeQuery.error,
    isEquipe: isEquipeQuery.data,
  })

  // "forbidden" exige um signOut real — efeito colateral, nunca disparado
  // durante o render (ver instrução da rodada, seção 8). O ref garante uma
  // única chamada mesmo com re-render/StrictMode, e sobrevive até o
  // componente desmontar (o que acontece assim que o <Navigate> abaixo
  // troca a rota pra /login, já que ProtectedRoute não faz parte da árvore
  // de /login). signOut() é fire-and-forget aqui de propósito: não há
  // nenhum setState local esperando essa promise resolver, então não existe
  // risco de "atualização de estado após unmount" — quem reage à conclusão
  // do logout é o próprio AuthContext (via onAuthStateChange, que já tem
  // sua própria proteção contra unmount), fazendo `session` virar `null` e
  // este componente re-renderizar sozinho pro estado `unauthenticated`.
  const forcedSignOutRef = React.useRef(false)

  React.useEffect(() => {
    if (state !== "forbidden" || forcedSignOutRef.current) return
    forcedSignOutRef.current = true
    void signOut()
  }, [state, signOut])

  if (state === "session-loading" || state === "authorization-loading" || state === "forbidden") {
    // "forbidden" renderiza o mesmo bloqueio neutro enquanto o signOut()
    // disparado acima ainda não fez `session` virar null — nunca Outlet.
    return <BlockingSpinner />
  }

  if (state === "unauthenticated") {
    // `forcedSignOutRef.current` só é true se chegamos aqui vindos de um
    // signOut forçado por `forbidden` (nunca num /login "normal", sem
    // sessão nenhuma) — a mensagem só aparece nesse caso.
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

  if (state === "authorization-error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <ErrorState
          title="Não foi possível verificar seu acesso"
          description="Tente novamente."
          onRetry={() => void isEquipeQuery.refetch()}
        />
      </div>
    )
  }

  // state === "authorized"
  return <Outlet />
}
