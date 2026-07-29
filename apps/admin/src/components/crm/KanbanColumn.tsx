import { useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { LEAD_STATUS_COLOR, type LeadStatus } from "@tania-joias/shared"

import { KanbanCard } from "@/components/crm/KanbanCard"
import { cn } from "@/lib/utils"
import type { Lead } from "@/types"

interface KanbanColumnProps {
  status: LeadStatus
  label: string
  leads: Lead[]
  onSelectLead: (lead: Lead) => void
}

export function KanbanColumn({ status, label, leads, onSelectLead }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const color = LEAD_STATUS_COLOR[status]

  return (
    <div className="flex w-80 shrink-0 flex-col rounded-xl bg-secondary/60">
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
          <h3 className="text-sm font-semibold text-foreground">{label}</h3>
        </div>
        <span className="rounded-full bg-card px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {leads.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[120px] flex-1 flex-col gap-2 overflow-y-auto rounded-lg p-2 pt-0 transition-colors",
          isOver && "bg-gold/10",
        )}
      >
        <SortableContext items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
          {leads.map((lead) => (
            <KanbanCard key={lead.id} lead={lead} onClick={() => onSelectLead(lead)} />
          ))}
        </SortableContext>
        {leads.length === 0 && (
          <div className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
            Nenhum lead nesta etapa
          </div>
        )}
      </div>
    </div>
  )
}
