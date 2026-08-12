import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { supabase } from "@/lib/supabase"
import type { Answer, AiAnalysis, Lead } from "@/types"

async function fetchLead(id: string): Promise<Lead> {
  const { data, error } = await supabase.from("leads").select("*").eq("id", id).single()
  if (error) throw error
  return data
}

async function fetchAnswers(leadId: string): Promise<Answer[]> {
  const { data, error } = await supabase
    .from("answers")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true })
  if (error) throw error
  return data ?? []
}

async function fetchAnalysis(leadId: string): Promise<AiAnalysis | null> {
  const { data, error } = await supabase
    .from("ai_analysis")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

export function useLead(id: string | undefined) {
  return useQuery({
    queryKey: ["lead", id],
    queryFn: () => fetchLead(id as string),
    enabled: Boolean(id),
  })
}

export function useLeadAnswers(id: string | undefined) {
  return useQuery({
    queryKey: ["lead-answers", id],
    queryFn: () => fetchAnswers(id as string),
    enabled: Boolean(id),
  })
}

export function useLeadAnalysis(id: string | undefined) {
  return useQuery({
    queryKey: ["lead-analysis", id],
    queryFn: () => fetchAnalysis(id as string),
    enabled: Boolean(id),
  })
}

interface UpdateLeadInput {
  id: string
  patch: Partial<Pick<Lead, "status" | "observacoes" | "etapa_pos_aprovacao">>
  /** Status da lead ANTES deste patch — usado só para decidir se o evento de aprovação deve disparar. */
  previousStatus?: Lead["status"]
}

export function useUpdateLead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, patch }: UpdateLeadInput) => {
      const { data, error } = await supabase
        .from("leads")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(["lead", data.id], data)
      void queryClient.invalidateQueries({ queryKey: ["leads"] })
      void queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
      void queryClient.invalidateQueries({ queryKey: ["reports"] })

      // Só dispara quando ESTA atualização é a que aprova a lead — não quando
      // ela já estava aprovada e só a etapa pós-aprovação mudou (arrastar
      // entre Contatada/Confirmada/Ativa/Desistiu não pode reenviar o evento).
      if (variables.patch.status === "aprovada" && variables.previousStatus !== "aprovada") {
        // Avisa o Meta Conversions API sobre a aprovação manual (a lead pode
        // ter caído em "análise" e só sido aprovada dias depois pela equipe,
        // quando o Pixel do navegador já não está mais disponível). Fire-and-
        // -forget: nunca deve travar a UI do Admin.
        supabase.functions
          .invoke("send-meta-lead-event", { body: { lead_id: data.id } })
          .then(({ error }) => {
            if (error) console.warn("[meta] falha ao enviar evento Lead", error)
          })

        // Mesma lógica pro WhatsApp automático de aprovação — cobre o caso de
        // aprovação manual (a Sofia só dispara isso sozinha quando a IPR
        // aprova na hora, em `finalize-candidate`). Best-effort e idempotente
        // (a Edge Function checa a flag e `whatsapp_automatico_enviado_em`).
        supabase.functions
          .invoke("send-whatsapp-approval", { body: { lead_id: data.id } })
          .then(({ error }) => {
            if (error) console.warn("[whatsapp] falha ao enviar aprovação", error)
          })
      }
    },
  })
}
