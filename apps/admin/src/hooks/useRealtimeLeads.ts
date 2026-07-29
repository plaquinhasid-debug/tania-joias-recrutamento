import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"

import { supabase } from "@/lib/supabase"

/**
 * Assina mudanças em tempo real na tabela `leads` (via Supabase Realtime) e
 * invalida as queries relevantes para que dashboard, tabela e kanban se
 * atualizem sozinhos sem precisar de refresh manual.
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
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [queryClient])
}
