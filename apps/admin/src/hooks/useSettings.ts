import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { Json, NaturalConversationModeValue } from "@tania-joias/shared"

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

const SOFIA_PERGUNTAS_IA_ATIVA_KEY = "sofia_perguntas_ia_ativa"

async function fetchSofiaPerguntasIaAtiva(): Promise<boolean> {
  const { data, error } = await supabase
    .from("settings")
    .select("valor")
    .eq("chave", SOFIA_PERGUNTAS_IA_ATIVA_KEY)
    .maybeSingle()

  if (error) throw error
  const valor = data?.valor as { ativa?: boolean } | undefined
  return Boolean(valor?.ativa)
}

export function useSofiaPerguntasIaAtiva() {
  return useQuery({
    queryKey: ["settings", SOFIA_PERGUNTAS_IA_ATIVA_KEY],
    queryFn: fetchSofiaPerguntasIaAtiva,
    staleTime: 30_000,
  })
}

export function useSaveSofiaPerguntasIaAtiva() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ativa: boolean) => {
      const { error } = await supabase.from("settings").upsert(
        {
          chave: SOFIA_PERGUNTAS_IA_ATIVA_KEY,
          valor: { ativa } as unknown as Json,
          descricao:
            "Liga/desliga a Sofia respondendo perguntas de negócio reais da candidata (via IA + base de conhecimento) durante a conversa (FEATURE-004). Quando desativado, comportamento idêntico ao roteiro fixo de hoje.",
        },
        { onConflict: "chave" },
      )
      if (error) throw error
      return ativa
    },
    onSuccess: (ativa) => {
      queryClient.setQueryData(["settings", SOFIA_PERGUNTAS_IA_ATIVA_KEY], ativa)
    },
  })
}

const SOFIA_CONDUCAO_NATURAL_KEY = "sofia_conducao_natural"

/**
 * Só OFF e SHADOW podem ser SALVOS pelo Admin nesta fase (FEATURE-005
 * Parte 5, Objetivo 6/13) — ACTIVE existe no contrato mas ainda não tem
 * comportamento implementado, então a UI nem oferece a opção de salvar
 * esse valor. Se o valor lido do banco for "ACTIVE" (só aconteceria por
 * uma mudança manual direto no SQL), `useSofiaConducaoNatural` ainda
 * devolve o valor real pra exibição — só `useSaveSofiaConducaoNatural` é
 * restrito.
 */
export type SavableNaturalConversationMode = "OFF" | "SHADOW"

async function fetchSofiaConducaoNatural(): Promise<NaturalConversationModeValue> {
  const { data, error } = await supabase
    .from("settings")
    .select("valor")
    .eq("chave", SOFIA_CONDUCAO_NATURAL_KEY)
    .maybeSingle()

  if (error) throw error
  const modo = (data?.valor as { modo?: unknown } | undefined)?.modo
  if (modo === "OFF" || modo === "SHADOW" || modo === "ACTIVE") return modo
  return "OFF"
}

export function useSofiaConducaoNatural() {
  return useQuery({
    queryKey: ["settings", SOFIA_CONDUCAO_NATURAL_KEY],
    queryFn: fetchSofiaConducaoNatural,
    staleTime: 30_000,
  })
}

export function useSaveSofiaConducaoNatural() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (modo: SavableNaturalConversationMode) => {
      if (modo !== "OFF" && modo !== "SHADOW") {
        throw new Error(`Valor não permitido para sofia_conducao_natural: ${String(modo)}`)
      }
      const { error } = await supabase.from("settings").upsert(
        {
          chave: SOFIA_CONDUCAO_NATURAL_KEY,
          valor: { modo } as unknown as Json,
          descricao:
            'Controla o modo da "condução natural" da Sofia (FEATURE-005): OFF = comportamento atual, sem nenhuma mudança visível; SHADOW = classifica e observa em segundo plano, sem exibir nada pra candidata; ACTIVE = ainda não implementado. Default OFF.',
        },
        { onConflict: "chave" },
      )
      if (error) throw error
      return modo
    },
    onSuccess: (modo) => {
      queryClient.setQueryData(["settings", SOFIA_CONDUCAO_NATURAL_KEY], modo)
    },
  })
}
