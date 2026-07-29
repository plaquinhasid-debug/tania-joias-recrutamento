import { useQuery } from "@tanstack/react-query"
import { KANBAN_COLUMNS } from "@tania-joias/shared"
import { endOfDay, format, isAfter, isSameDay, startOfDay, subDays } from "date-fns"

import { supabase } from "@/lib/supabase"

interface LeadStatRow {
  id: string
  created_at: string
  status: string
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

async function fetchDashboardStats(): Promise<DashboardStats> {
  const { data, error } = await supabase
    .from("leads")
    .select("id, created_at, status")
    .order("created_at", { ascending: true })

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

  const funnel = KANBAN_COLUMNS.map((col) => ({
    status: col.status,
    label: col.label,
    total: statusCounts.get(col.status) ?? 0,
  }))

  const timelineDays: { date: string; label: string; total: number }[] = []
  for (let i = 13; i >= 0; i -= 1) {
    const day = subDays(todayStart, i)
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

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: fetchDashboardStats,
    staleTime: 15_000,
  })
}
