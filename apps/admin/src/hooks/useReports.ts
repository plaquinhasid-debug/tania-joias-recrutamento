import { useQuery } from "@tanstack/react-query"

import { supabase } from "@/lib/supabase"

interface ReportLeadRow {
  status: string
  cidade: string | null
  origem: string | null
  campanha: string | null
}

export interface DistributionItem {
  label: string
  total: number
  aprovadas: number
  taxaAprovacao: number
}

export interface ReportsData {
  totalLeads: number
  totalAprovadas: number
  conversionRate: number
  porCidade: DistributionItem[]
  porOrigem: DistributionItem[]
  rankingCampanhas: DistributionItem[]
}

function buildDistribution(
  rows: ReportLeadRow[],
  key: "cidade" | "origem" | "campanha",
): DistributionItem[] {
  const map = new Map<string, { total: number; aprovadas: number }>()

  for (const row of rows) {
    const label = row[key]?.trim() || "Não informado"
    const entry = map.get(label) ?? { total: 0, aprovadas: 0 }
    entry.total += 1
    if (row.status === "aprovada") entry.aprovadas += 1
    map.set(label, entry)
  }

  return Array.from(map.entries())
    .map(([label, { total, aprovadas }]) => ({
      label,
      total,
      aprovadas,
      taxaAprovacao: total > 0 ? (aprovadas / total) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total)
}

async function fetchReports(): Promise<ReportsData> {
  const { data, error } = await supabase
    .from("leads")
    .select("status, cidade, origem, campanha")

  if (error) throw error
  const rows = (data ?? []) as ReportLeadRow[]

  const totalLeads = rows.length
  const totalAprovadas = rows.filter((row) => row.status === "aprovada").length
  const conversionRate = totalLeads > 0 ? (totalAprovadas / totalLeads) * 100 : 0

  return {
    totalLeads,
    totalAprovadas,
    conversionRate,
    porCidade: buildDistribution(rows, "cidade"),
    porOrigem: buildDistribution(rows, "origem"),
    rankingCampanhas: buildDistribution(rows, "campanha").sort(
      (a, b) => b.taxaAprovacao - a.taxaAprovacao || b.total - a.total,
    ),
  }
}

export function useReports() {
  return useQuery({
    queryKey: ["reports"],
    queryFn: fetchReports,
    staleTime: 30_000,
  })
}
