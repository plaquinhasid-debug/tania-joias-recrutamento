import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { supabase } from "@/lib/supabase"
import type { LeadFicha } from "@/types"

// URL pública da Landing — é lá que mora a página `/ficha/:token` que a
// candidata preenche. Preparado pra automação futura: gerar a linha é só um
// insert (RLS de `authenticated`), então tanto este botão manual quanto um
// gatilho automático na aprovação podem chamar `useGenerateFichaLink` do
// mesmo jeito.
const LANDING_URL = "https://tania-joias-landing.vercel.app"

export function fichaLinkUrl(token: string): string {
  return `${LANDING_URL}/ficha/${token}`
}

async function fetchLeadFicha(leadId: string): Promise<LeadFicha | null> {
  const { data, error } = await supabase
    .from("leads_ficha")
    .select("*")
    .eq("lead_id", leadId)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

export function useLeadFicha(leadId: string | undefined) {
  return useQuery({
    queryKey: ["lead-ficha", leadId],
    queryFn: () => fetchLeadFicha(leadId as string),
    enabled: Boolean(leadId),
  })
}

export function useGenerateFichaLink() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (leadId: string) => {
      const { data, error } = await supabase
        .from("leads_ficha")
        .insert({ lead_id: leadId })
        .select("*")
        .single()
      if (error) throw error

      // Avança o card pra "Ficha enviada" no Kanban sozinho — só quando ela
      // ainda estava parada em "Aprovada" (`.is(..., null)` evita empurrar
      // pra trás uma lead que já tinha avançado mais, ex.: se o link for
      // gerado de novo por engano).
      await supabase
        .from("leads")
        .update({ etapa_pos_aprovacao: "contatada" })
        .eq("id", leadId)
        .is("etapa_pos_aprovacao", null)

      return data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["lead-ficha", data.lead_id], data)
      void queryClient.invalidateQueries({ queryKey: ["leads"] })
      void queryClient.invalidateQueries({ queryKey: ["lead", data.lead_id] })
    },
  })
}
