import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ClipboardCheck, ClipboardList, PhoneCall } from "lucide-react"
import { PROXIMA_ACAO_LABEL } from "@tania-joias/shared"

import { Badge } from "@/components/ui/badge"
import { PerfilComercialBadge } from "@/components/leads/PerfilComercialBadge"
import { PROXIMA_ACAO_VARIANT } from "@/components/leads/SofiaAnalysisCard"
import { cn } from "@/lib/utils"
import { formatDate, formatPhone } from "@/lib/format"
import { fichaStatusForLead, latestProximaAcao, type LeadWithAnalysis } from "@/hooks/useLeads"

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
