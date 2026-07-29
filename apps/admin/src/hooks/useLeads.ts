import { useQuery } from "@tanstack/react-query"

import { supabase } from "@/lib/supabase"
import type { Lead, LeadFiltersState } from "@/types"

export const DEFAULT_LEAD_FILTERS: LeadFiltersState = {
  search: "",
  status: "todos",
  perfilComercial: "todos",
  origem: "todos",
  cidade: "todos",
  dateFrom: null,
  dateTo: null,
}

async function fetchLeads(filters: LeadFiltersState): Promise<Lead[]> {
  let query = supabase.from("leads").select("*").order("created_at", { ascending: false })

  if (filters.status !== "todos") {
    query = query.eq("status", filters.status as Lead["status"])
  }
  if (filters.perfilComercial !== "todos") {
    query = query.eq(
      "perfil_comercial",
      filters.perfilComercial as NonNullable<Lead["perfil_comercial"]>,
    )
  }
  if (filters.origem !== "todos") {
    query = query.eq("origem", filters.origem)
  }
  if (filters.cidade !== "todos") {
    query = query.eq("cidade", filters.cidade)
  }
  if (filters.dateFrom) {
    query = query.gte("created_at", filters.dateFrom)
  }
  if (filters.dateTo) {
    query = query.lte("created_at", `${filters.dateTo}T23:59:59.999`)
  }
  if (filters.search.trim()) {
    const term = filters.search.trim().replace(/[%_]/g, "")
    query = query.or(`nome.ilike.%${term}%,telefone.ilike.%${term}%,cidade.ilike.%${term}%`)
  }

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export function useLeads(filters: LeadFiltersState) {
  return useQuery({
    queryKey: ["leads", filters],
    queryFn: () => fetchLeads(filters),
    staleTime: 15_000,
  })
}

export function useLeadOptions() {
  return useQuery({
    queryKey: ["leads", "options"],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("origem, cidade")
      if (error) throw error
      const origens = new Set<string>()
      const cidades = new Set<string>()
      for (const row of data ?? []) {
        if (row.origem) origens.add(row.origem)
        if (row.cidade) cidades.add(row.cidade)
      }
      return {
        origens: Array.from(origens).sort(),
        cidades: Array.from(cidades).sort(),
      }
    },
    staleTime: 60_000,
  })
}
