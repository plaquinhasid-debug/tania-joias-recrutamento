import * as React from "react"
import { CalendarDays, CheckCircle2, TrendingUp, Users, XCircle } from "lucide-react"

import { PageHeader } from "@/components/common/PageHeader"
import { ErrorState } from "@/components/common/ErrorState"
import { StatCard, StatCardSkeleton } from "@/components/dashboard/StatCard"
import { LeadsLineChart } from "@/components/dashboard/LeadsLineChart"
import { StatusFunnelChart } from "@/components/dashboard/StatusFunnelChart"
import { DashboardFilters } from "@/components/dashboard/DashboardFilters"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DEFAULT_DASHBOARD_FILTERS,
  useDashboardStats,
  type DashboardFiltersState,
} from "@/hooks/useDashboardStats"
import { useRealtimeLeads } from "@/hooks/useRealtimeLeads"
import { formatPercent } from "@/lib/format"

export default function DashboardPage() {
  useRealtimeLeads()
  const [filters, setFilters] = React.useState<DashboardFiltersState>(DEFAULT_DASHBOARD_FILTERS)
  const { data, isLoading, isError, refetch } = useDashboardStats(filters)
  const hasActiveFilters = filters.dateFrom !== null || filters.dateTo !== null

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Visão geral das candidatas a revendedora captadas pela Landing Page."
      />

      <DashboardFilters filters={filters} onChange={setFilters} />

      {isError && (
        <ErrorState description="Verifique sua conexão e tente novamente." onRetry={() => refetch()} />
      )}

      {!isError && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {isLoading || !data ? (
              Array.from({ length: 6 }).map((_, i) => <StatCardSkeleton key={i} />)
            ) : (
              <>
                <StatCard label="Leads hoje" value={String(data.today)} icon={CalendarDays} />
                <StatCard label="Leads na semana" value={String(data.week)} icon={CalendarDays} accent="gold" />
                <StatCard label="Leads no mês" value={String(data.month)} icon={Users} />
                <StatCard label="Aprovadas" value={String(data.aprovadas)} icon={CheckCircle2} accent="success" />
                <StatCard label="Reprovadas" value={String(data.reprovadas)} icon={XCircle} accent="destructive" />
                <StatCard
                  label="Taxa de conversão"
                  value={formatPercent(data.conversionRate, 1)}
                  icon={TrendingUp}
                  accent="gold"
                />
              </>
            )}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>
                  {hasActiveFilters
                    ? "Evolução de leads no período selecionado"
                    : "Evolução de leads (últimos 14 dias)"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading || !data ? (
                  <div className="h-[260px] animate-pulse rounded-lg bg-secondary" />
                ) : (
                  <LeadsLineChart data={data.timeline} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Funil por status</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading || !data ? (
                  <div className="h-[260px] animate-pulse rounded-lg bg-secondary" />
                ) : (
                  <StatusFunnelChart data={data.funnel} />
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
