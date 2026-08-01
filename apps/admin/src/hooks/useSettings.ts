import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { Json } from "@tania-joias/shared"

import { supabase } from "@/lib/supabase"
import type { CidadesAtendidasValue } from "@/types"

const SETTING_KEY = "cidades_atendidas"

const DEFAULT_VALUE: CidadesAtendidasValue = { restringir: false, lista: [] }

async function fetchCidadesAtendidas(): Promise<CidadesAtendidasValue> {
  const { data, error } = await supabase
    .from("settings")
    .select("valor")
    .eq("chave", SETTING_KEY)
    .maybeSingle()

  if (error) throw error
  if (!data?.valor) return DEFAULT_VALUE

  const valor = data.valor as Partial<CidadesAtendidasValue>
  return {
    restringir: Boolean(valor.restringir),
    lista: Array.isArray(valor.lista) ? valor.lista : [],
  }
}

export function useCidadesAtendidas() {
  return useQuery({
    queryKey: ["settings", SETTING_KEY],
    queryFn: fetchCidadesAtendidas,
    staleTime: 30_000,
  })
}

export function useSaveCidadesAtendidas() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (value: CidadesAtendidasValue) => {
      const { error } = await supabase
        .from("settings")
        .upsert(
          {
            chave: SETTING_KEY,
            valor: value as unknown as Json,
            descricao: "Cidades atendidas pela revenda",
          },
          { onConflict: "chave" },
        )
      if (error) throw error
      return value
    },
    onSuccess: (value) => {
      queryClient.setQueryData(["settings", SETTING_KEY], value)
    },
  })
}

const SOFIA_IA_ATIVA_KEY = "sofia_ia_ativa"

async function fetchSofiaIaAtiva(): Promise<boolean> {
  const { data, error } = await supabase
    .from("settings")
    .select("valor")
    .eq("chave", SOFIA_IA_ATIVA_KEY)
    .maybeSingle()

  if (error) throw error
  const valor = data?.valor as { ativa?: boolean } | undefined
  return Boolean(valor?.ativa)
}

export function useSofiaIaAtiva() {
  return useQuery({
    queryKey: ["settings", SOFIA_IA_ATIVA_KEY],
    queryFn: fetchSofiaIaAtiva,
    staleTime: 30_000,
  })
}

export function useSaveSofiaIaAtiva() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ativa: boolean) => {
      const { error } = await supabase.from("settings").upsert(
        {
          chave: SOFIA_IA_ATIVA_KEY,
          valor: { ativa } as unknown as Json,
          descricao:
            "Liga/desliga as camadas de IA (Claude) da Sofia: análise final expandida e reações contextuais na conversa. Quando desativado, comportamento idêntico ao roteiro fixo + resumo simples.",
        },
        { onConflict: "chave" },
      )
      if (error) throw error
      return ativa
    },
    onSuccess: (ativa) => {
      queryClient.setQueryData(["settings", SOFIA_IA_ATIVA_KEY], ativa)
    },
  })
}
