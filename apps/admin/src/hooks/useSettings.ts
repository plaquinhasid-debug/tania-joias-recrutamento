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
