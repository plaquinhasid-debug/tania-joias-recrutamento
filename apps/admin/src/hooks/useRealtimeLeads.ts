import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"

import { supabase } from "@/lib/supabase"

/**
 * Assina mudanças em tempo real na tabela `leads` (via Supabase Realtime) e
 * invalida as queries relevantes para que dashboard, tabela e kanban se
 * atualizem sozinhos sem precisar de refresh manual.
 *
 * IMPLEMENTATION-CRM-005C — também assina `whatsapp_messages`: o webhook de
 * status (`apps/admin/api/webhooks/whatsapp.mjs`) grava `sent`/`delivered`/
 * `read`/`failed` só nessa tabela, nunca em `leads` — sem este segundo
 * listener, `fetchLeads` (`useLeads.ts`) nunca era revalidada quando um
 * status de entrega mudava, e o Kanban ficava preso no estado antigo até um
 * reload manual (causa raiz confirmada com o caso real da Rafaela Alves
 * Viana, 20/08/2026). Só invalida `["leads"]` aqui — é a mesma query que já
 * embute `whatsapp_messages` via join (`useLeads.ts`), não precisa de
 * `dashboard-stats`/`reports`, que não dependem de status de WhatsApp.
 *
 * Depende de `whatsapp_messages` estar cadastrada na publicação Realtime do
 * Supabase (`supabase_realtime`) — hoje não está (nem `leads` está), então
 * este listener fica pronto no código mas só passa a disparar de verdade
 * depois que alguém habilitar a replicação das duas tabelas no Supabase.
 */
export function useRealtimeLeads() {
  const queryClient = useQueryClient()

  React.useEffect(() => {
    const channel = supabase
      .channel("leads-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads" },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["leads"] })
          void queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
          void queryClient.invalidateQueries({ queryKey: ["reports"] })
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_messages" },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["leads"] })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [queryClient])
}
