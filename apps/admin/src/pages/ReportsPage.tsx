import { BarChart3, CheckCircle2, Users } from "lucide-react"

import { PageHeader } from "@/components/common/PageHeader"
import { ErrorState } from "@/components/common/ErrorState"
import { EmptyState } from "@/components/common/EmptyState"
import { StatCard, StatCardSkeleton } from "@/components/dashboard/StatCard"
import { DistributionChart } from "@/components/reports/DistributionChart"
import { CampaignRankingTable } from "@/components/reports/CampaignRankingTable"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useReports } from "@/hooks/useReports"
import { formatPercent } from "@/lib/format"

export default function ReportsPage() {
  const { data, isLoading, isError, refetch } = useReports()

  return (
    <div>
      <PageHeader
        title="Relatórios"
        description="Volume de leads, conversão e desempenho por cidade, origem e campanha."
      />

      {isError && <ErrorState onRetry={() => refetch()} />}

      {!isError && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {isLoading || !data ? (
              Array.from({ length: 3 }).map((_, i) => <StatCardSkeleton key={i} />)
            ) : (
              <>
                <StatCard label="Total de leads" value={String(data.totalLeads)} icon={Users} />
                <StatCard
                  label="Aprovadas"
                  value={String(data.totalAprovadas)}
                  icon={CheckCircle2}
                  accent="success"
                />
                <StatCard
                  label="Taxa de conversão"
                  value={formatPercent(data.conversionRate, 1)}
                  icon={BarChart3}
                  accent="gold"
                />
              </>
            )}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Distribuição por cidade</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading || !data ? (
                  <Skeleton className="h-[280px] w-full" />
                ) : data.porCidade.length === 0 ? (
                  <EmptyState title="Sem dados de cidade ainda" />
                ) : (
                  <DistributionChart data={data.porCidade} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Distribuição por origem</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading || !data ? (
                  <Skeleton className="h-[280px] w-full" />
                ) : data.porOrigem.length === 0 ? (
                  <EmptyState title="Sem dados de origem ainda" />
                ) : (
                  <DistributionChart data={data.porOrigem} />
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Ranking de campanhas</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading || !data ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <CampaignRankingTable data={data.rankingCampanhas} />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
