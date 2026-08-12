import { MessageCircle, UserX } from "lucide-react"

import { PageHeader } from "@/components/common/PageHeader"
import { EmptyState } from "@/components/common/EmptyState"
import { ErrorState } from "@/components/common/ErrorState"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useAbandonedConversations } from "@/hooks/useAbandonedConversations"
import { formatDateTime, formatPhone, formatRelative, whatsappLink } from "@/lib/format"

export default function AbandonmentPage() {
  const { data: conversations, isLoading, isError, refetch } = useAbandonedConversations()

  return (
    <div>
      <PageHeader
        title="Abandonos"
        description="Candidatas que começaram a conversa com a Sofia e pararam no meio, sem finalizar."
      />

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="rounded-xl border border-border bg-card">
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
      ) : !conversations || conversations.length === 0 ? (
        <EmptyState
          icon={UserX}
          title="Nenhum abandono no momento"
          description="Assim que alguma candidata parar no meio da conversa com a Sofia por mais de 30 minutos, ela aparece aqui."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead>Começou</TableHead>
                <TableHead>Parou em</TableHead>
                <TableHead>Parada há</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {conversations.map((conv) => {
                const waLink = whatsappLink(conv.telefone)
                return (
                  <TableRow key={conv.sessionId} className="hover:bg-transparent">
                    <TableCell className="font-medium text-foreground">
                      {conv.nome ?? "Sem nome ainda"}
                    </TableCell>
                    <TableCell>{conv.telefone ? formatPhone(conv.telefone) : "—"}</TableCell>
                    <TableCell>{conv.cidade ?? "—"}</TableCell>
                    <TableCell>{formatDateTime(conv.startedAt)}</TableCell>
                    <TableCell>{conv.ultimaPergunta ?? "Não respondeu nada"}</TableCell>
                    <TableCell>
                      {formatRelative(conv.ultimaRespostaEm ?? conv.startedAt)}
                    </TableCell>
                    <TableCell>
                      {waLink && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={waLink} target="_blank" rel="noopener noreferrer">
                            <MessageCircle className="size-3.5" />
                            WhatsApp
                          </a>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
