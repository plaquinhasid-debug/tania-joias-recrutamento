import { PageHeader } from "@/components/common/PageHeader"
import { ErrorState } from "@/components/common/ErrorState"
import { EmbaixadorasTable } from "@/components/embaixadoras/EmbaixadorasTable"
import { useEmbaixadoras } from "@/hooks/useEmbaixadoras"

// IMPLEMENTATION-EMBAIXADORAS-E2.3-E — listagem V1, somente leitura. Sem
// botão "Convidar Embaixadora" nesta etapa (entra numa rodada posterior,
// junto com a mutation real de create-ambassador-invite).
export default function EmbaixadorasPage() {
  const { data: embaixadoras, isLoading, isError, refetch } = useEmbaixadoras()

  return (
    <div>
      <PageHeader
        title="Embaixadoras"
        description="Gerencie as participantes do Programa Embaixadoras Tania Jóias."
      />

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <EmbaixadorasTable embaixadoras={embaixadoras ?? []} isLoading={isLoading} />
      )}
    </div>
  )
}
