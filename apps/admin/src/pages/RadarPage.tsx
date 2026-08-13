import * as React from "react"
import { Radar } from "lucide-react"

import { PageHeader } from "@/components/common/PageHeader"
import { ErrorState } from "@/components/common/ErrorState"
import { EmptyState } from "@/components/common/EmptyState"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { RadarFunnelChart } from "@/components/radar/RadarFunnelChart"
import { RadarStepsList } from "@/components/radar/RadarStepsList"
import { RadarFilters } from "@/components/radar/RadarFilters"
import { DEFAULT_RADAR_FILTERS, useRadarFunil, type RadarFiltersState } from "@/hooks/useRadarFunil"

export default function RadarPage() {
  const [filters, setFilters] = React.useState<RadarFiltersState>(DEFAULT_RADAR_FILTERS)
  const { data: steps, isLoading, isError, refetch } = useRadarFunil(filters)

  const totalEvents = steps?.reduce((acc, step) => acc + step.total, 0) ?? 0
  const hasActiveFilters = filters.dateFrom !== null || filters.dateTo !== null

  return (
    <div>
      <PageHeader
        title="Radar da Sofia"
        description="Acompanhe, em tempo real, cada etapa da jornada da candidata na conversa com a Sofia."
      />

      <RadarFilters filters={filters} onChange={setFilters} />

      {isError && <ErrorState onRetry={() => refetch()} />}

      {!isError && (
        <>
          {isLoading || !steps ? (
            <Skeleton className="h-[360px] w-full rounded-xl" />
          ) : totalEvents === 0 ? (
            <EmptyState
              icon={Radar}
              title={
                hasActiveFilters
                  ? "Nenhum evento no período selecionado"
                  : "Ainda não há eventos registrados"
              }
              description={
                hasActiveFilters
                  ? "Tente ampliar o período ou limpar o filtro de data."
                  : "Assim que a Landing Page começar a gerar tráfego e conversas, o funil aparece aqui."
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
              <Card className="lg:col-span-3">
                <CardHeader>
                  <CardTitle>Funil de conversão</CardTitle>
                  <CardDescription>
                    Do clique no anúncio até a aprovação como revendedora.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <RadarFunnelChart steps={steps} />
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Etapas em detalhe</CardTitle>
                  <CardDescription>Contagem e taxa de conversão entre etapas.</CardDescription>
                </CardHeader>
                <CardContent>
                  <RadarStepsList steps={steps} />
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  )
}
