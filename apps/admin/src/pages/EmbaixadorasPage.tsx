import { PageHeader } from "@/components/common/PageHeader"
import { ErrorState } from "@/components/common/ErrorState"
import { EmbaixadorasTable } from "@/components/embaixadoras/EmbaixadorasTable"
import { ConvidarEmbaixadoraDialog } from "@/components/embaixadoras/ConvidarEmbaixadoraDialog"
import { useEmbaixadoras } from "@/hooks/useEmbaixadoras"

export default function EmbaixadorasPage() {
  const { data: embaixadoras, isLoading, isError, refetch } = useEmbaixadoras()

  return (
    <div>
      <PageHeader
        title="Embaixadoras"
        description="Gerencie as participantes do Programa Embaixadoras Tania Jóias."
        action={<ConvidarEmbaixadoraDialog />}
      />

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <EmbaixadorasTable embaixadoras={embaixadoras ?? []} isLoading={isLoading} />
      )}
    </div>
  )
}
