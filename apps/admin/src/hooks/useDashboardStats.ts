import { useQuery } from "@tanstack/react-query"
import { LEAD_STATUS_LABEL, type LeadStatus } from "@tania-joias/shared"
import { addDays, endOfDay, format, isAfter, isSameDay, parseISO, startOfDay, subDays } from "date-fns"

// Distribuição por `lead_status` pro gráfico do Dashboard — só as 4 colunas
// originais, sem as etapas pós-aprovação do Kanban (que vivem em
// `PIPELINE_COLUMNS`, um recorte diferente, usado só no CRM).
const DASHBOARD_STATUS_ORDER: LeadStatus[] = ["novo", "em_analise", "aprovada", "reprovada"]

import { supabase } from "@/lib/supabase"

interface LeadStatRow {
  id: string
  created_at: string
  status: string
}

export interface DashboardFiltersState {
  dateFrom: string | null
  dateTo: string | null
}

export const DEFAULT_DASHBOARD_FILTERS: DashboardFiltersState = {
  dateFrom: null,
  dateTo: null,
}

export interface DashboardStats {
  today: number
  week: number
  month: number
  aprovadas: number
  reprovadas: number
  conversionRate: number
  funnel: { status: string; label: string; total: number }[]
  timeline: { date: string; label: string; total: number }[]
}

async function fetchDashboardStats(
  filters: DashboardFiltersState = DEFAULT_DASHBOARD_FILTERS,
): Promise<DashboardStats> {
  let query = supabase
    .from("leads")
    .select("id, created_at, status")
    .order("created_at", { ascending: true })

  if (filters.dateFrom) {
    query = query.gte("created_at", filters.dateFrom)
  }
  if (filters.dateTo) {
    query = query.lte("created_at", `${filters.dateTo}T23:59:59.999`)
  }

  const { data, error } = await query
  if (error) throw error
  const rows = (data ?? []) as LeadStatRow[]

  const now = new Date()
  const todayStart = startOfDay(now)
  const weekStart = subDays(todayStart, 6)
  const monthStart = subDays(todayStart, 29)

  let today = 0
  let week = 0
  let month = 0
  let aprovadas = 0
  let reprovadas = 0

  const statusCounts = new Map<string, number>()

  for (const row of rows) {
    const createdAt = new Date(row.created_at)
    if (isAfter(createdAt, todayStart) || isSameDay(createdAt, todayStart)) today += 1
    if (isAfter(createdAt, weekStart)) week += 1
    if (isAfter(createdAt, monthStart)) month += 1
    if (row.status === "aprovada") aprovadas += 1
    if (row.status === "reprovada") reprovadas += 1
    statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1)
  }

  const total = rows.length
  const conversionRate = total > 0 ? (aprovadas / total) * 100 : 0

  const funnel = DASHBOARD_STATUS_ORDER.map((status) => ({
    status,
    label: LEAD_STATUS_LABEL[status],
    total: statusCounts.get(status) ?? 0,
  }))

  // Sem filtro: mantém o comportamento original (14 dias terminando hoje).
  // Com filtro, o gráfico passa a cobrir o período escolhido em vez de um
  // recorte fixo — faz mais sentido pra correlacionar com uma campanha.
  const rangeEnd = filters.dateTo ? startOfDay(parseISO(filters.dateTo)) : todayStart
  const rangeStart = filters.dateFrom ? startOfDay(parseISO(filters.dateFrom)) : subDays(rangeEnd, 13)

  const timelineDays: { date: string; label: string; total: number }[] = []
  for (let day = rangeStart; day <= rangeEnd; day = addDays(day, 1)) {
    const dayEnd = endOfDay(day)
    const total = rows.filter((row) => {
      const createdAt = new Date(row.created_at)
      return createdAt >= day && createdAt <= dayEnd
    }).length
    timelineDays.push({
      date: format(day, "yyyy-MM-dd"),
      label: format(day, "dd/MM"),
      total,
    })
  }

  return {
    today,
    week,
    month,
    aprovadas,
    reprovadas,
    conversionRate,
    funnel,
    timeline: timelineDays,
  }
}

export function useDashboardStats(filters: DashboardFiltersState = DEFAULT_DASHBOARD_FILTERS) {
  return useQuery({
    queryKey: ["dashboard-stats", filters],
    queryFn: () => fetchDashboardStats(filters),
    staleTime: 15_000,
  })
}
