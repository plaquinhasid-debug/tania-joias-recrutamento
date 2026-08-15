import type { MouseEvent } from "react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { AlarmClock, ClipboardCheck, ClipboardList, PhoneCall } from "lucide-react"
import { ETAPA_DETALHE_LABEL, PROXIMA_ACAO_LABEL, pipelineColumnKeyForLead } from "@tania-joias/shared"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PerfilComercialBadge } from "@/components/leads/PerfilComercialBadge"
import { PROXIMA_ACAO_VARIANT } from "@/components/leads/SofiaAnalysisCard"
import { cn } from "@/lib/utils"
import { formatDate, formatPhone, formatRelative, whatsappLinkWithMessage } from "@/lib/format"
import { fichaPendente, fichaStatusForLead, latestProximaAcao, type LeadWithAnalysis } from "@/hooks/useLeads"
import { fichaLinkUrl } from "@/hooks/useLeadFicha"

/** Mesmo espírito do lembrete manual de "Mandar pelo WhatsApp" — só que cobrando o preenchimento, não anunciando o link pela primeira vez. */
function mensagemLembrete(nome: string, token: string): string {
  const primeiroNome = nome.trim().split(/\s+/)[0] ?? ""
  return `Oi, ${primeiroNome}! 🌸\n\nPassando só pra lembrar de preencher sua Ficha de Aprovação e liberar seu Mostruário — é rapidinho:\n\n${fichaLinkUrl(token)}\n\nQualquer dúvida, é só chamar aqui! 💛`
}

interface KanbanCardProps {
  lead: LeadWithAnalysis
  onClick: () => void
}

export function KanbanCard({ lead, onClick }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const proximaAcao = latestProximaAcao(lead)
  const fichaStatus = fichaStatusForLead(lead)
  const etapaDetalhe = ETAPA_DETALHE_LABEL[pipelineColumnKeyForLead(lead)]
  const pendente = fichaPendente(lead)

  function handleLembrar(event: MouseEvent) {
    event.stopPropagation()
    if (!pendente) return
    const link = whatsappLinkWithMessage(lead.telefone, mensagemLembrete(lead.nome, pendente.token))
    if (link) window.open(link, "_blank", "noopener,noreferrer")
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "touch-none rounded-lg border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md",
        isDragging ? "cursor-grabbing opacity-50" : "cursor-grab",
      )}
      onClick={onClick}
    >
      <p className="text-sm font-medium text-foreground">{lead.nome}</p>
      <p className="mt-1 text-xs text-muted-foreground">{lead.cidade ?? "Cidade não informada"}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{formatPhone(lead.telefone)}</p>
      {etapaDetalhe && (
        <p className="mt-1 text-[11px] italic text-muted-foreground">{etapaDetalhe}</p>
      )}
      {proximaAcao && proximaAcao !== "aguardar" && (
        <Badge variant={PROXIMA_ACAO_VARIANT[proximaAcao]} className="mt-2 gap-1">
          <PhoneCall className="size-3" />
          {PROXIMA_ACAO_LABEL[proximaAcao]}
        </Badge>
      )}
      {fichaStatus && (
        <Badge variant={fichaStatus === "preenchida" ? "success" : "gold"} className="mt-2 gap-1">
          {fichaStatus === "preenchida" ? (
            <ClipboardCheck className="size-3" />
          ) : (
            <ClipboardList className="size-3" />
          )}
          {fichaStatus === "preenchida" ? "Ficha preenchida" : "Ficha pendente"}
        </Badge>
      )}
      {pendente && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">
            Enviada {formatRelative(pendente.criado_em)}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-6 gap-1 px-2 text-[11px]"
            disabled={lead.whatsapp !== true}
            onClick={handleLembrar}
          >
            <AlarmClock className="size-3" />
            Lembrar
          </Button>
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <PerfilComercialBadge perfil={lead.perfil_comercial} />
        <span className="text-xs font-medium tabular-nums text-muted-foreground">
          IPR {lead.ipr}
        </span>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">{formatDate(lead.created_at)}</p>
    </div>
  )
}
