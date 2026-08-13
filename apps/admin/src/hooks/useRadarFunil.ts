import { useQuery } from "@tanstack/react-query"
import { RADAR_FUNIL_STEPS } from "@tania-joias/shared"

import { supabase } from "@/lib/supabase"

export interface RadarStep {
  evento: string
  label: string
  total: number
  conversaoDoAnterior: number | null
  conversaoDoInicio: number
}

export interface RadarFiltersState {
  dateFrom: string | null
  dateTo: string | null
}

export const DEFAULT_RADAR_FILTERS: RadarFiltersState = {
  dateFrom: null,
  dateTo: null,
}

async function fetchRadarFunil(filters: RadarFiltersState): Promise<RadarStep[]> {
  let query = supabase.from("logs").select("tipo_evento")

  if (filters.dateFrom) {
    query = query.gte("created_at", filters.dateFrom)
  }
  if (filters.dateTo) {
    query = query.lte("created_at", `${filters.dateTo}T23:59:59.999`)
  }

  const { data, error } = await query
  if (error) throw error

  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    counts.set(row.tipo_evento, (counts.get(row.tipo_evento) ?? 0) + 1)
  }

  const first = counts.get(RADAR_FUNIL_STEPS[0]?.evento ?? "") ?? 0

  return RADAR_FUNIL_STEPS.map((step, index) => {
    const total = counts.get(step.evento) ?? 0
    const previousTotal = index > 0 ? (counts.get(RADAR_FUNIL_STEPS[index - 1].evento) ?? 0) : null
    return {
      evento: step.evento,
      label: step.label,
      total,
      conversaoDoAnterior:
        previousTotal && previousTotal > 0 ? (total / previousTotal) * 100 : null,
      conversaoDoInicio: first > 0 ? (total / first) * 100 : 0,
    }
  })
}

export function useRadarFunil(filters: RadarFiltersState = DEFAULT_RADAR_FILTERS) {
  return useQuery({
    queryKey: ["radar-funil", filters],
    queryFn: () => fetchRadarFunil(filters),
    staleTime: 30_000,
  })
}
