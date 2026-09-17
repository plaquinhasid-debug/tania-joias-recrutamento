import { useEffect, useState } from "react"

import { clearInviteTokenFromGlobal, readInviteTokenFromGlobal } from "@/lib/ambassadorInvite"

/**
 * Lê, uma única vez, o token que o script de bootstrap em index.html já
 * capturou da URL e sanitizou (ver comentário lá) — nunca localStorage,
 * sessionStorage, cookie ou IndexedDB, e nunca relido da URL (que a essa
 * altura já está limpa).
 *
 * A leitura mora no inicializador de `useState` (puro, sem efeito
 * colateral — seguro contra o double-invoke de desenvolvimento do
 * StrictMode). A limpeza da variável global roda à parte, em `useEffect`
 * (idempotente mesmo se o StrictMode disparar o efeito duas vezes) — ver
 * `readInviteTokenFromGlobal`/`clearInviteTokenFromGlobal` em
 * `lib/ambassadorInvite.ts` pro motivo de estarem separadas.
 */
export function useAmbassadorInviteToken(): string | null {
  const [token] = useState<string | null>(() =>
    readInviteTokenFromGlobal(window as unknown as Record<string, unknown>),
  )

  useEffect(() => {
    clearInviteTokenFromGlobal(window as unknown as Record<string, unknown>)
  }, [])

  return token
}
