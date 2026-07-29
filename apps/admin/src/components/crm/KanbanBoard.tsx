import * as React from "react"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { toast } from "sonner"
import { KANBAN_COLUMNS, type LeadStatus } from "@tania-joias/shared"

import { KanbanColumn } from "@/components/crm/KanbanColumn"
import { KanbanCard } from "@/components/crm/KanbanCard"
import { useUpdateLead } from "@/hooks/useLeadDetail"
import type { Lead } from "@/types"

type GroupedLeads = Record<LeadStatus, Lead[]>

function groupByStatus(leads: Lead[]): GroupedLeads {
  const grouped = Object.fromEntries(
    KANBAN_COLUMNS.map((col) => [col.status, [] as Lead[]]),
  ) as GroupedLeads
  for (const lead of leads) {
    grouped[lead.status]?.push(lead)
  }
  return grouped
}

interface KanbanBoardProps {
  leads: Lead[]
  onSelectLead: (lead: Lead) => void
}

export function KanbanBoard({ leads, onSelectLead }: KanbanBoardProps) {
  const [grouped, setGrouped] = React.useState<GroupedLeads>(() => groupByStatus(leads))
  const [activeLead, setActiveLead] = React.useState<Lead | null>(null)
  const updateLead = useUpdateLead()

  React.useEffect(() => {
    setGrouped(groupByStatus(leads))
  }, [leads])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  function findColumnOf(leadId: string): LeadStatus | null {
    for (const col of KANBAN_COLUMNS) {
      if (grouped[col.status].some((lead) => lead.id === leadId)) return col.status
    }
    return null
  }

  function handleDragStart(event: DragStartEvent) {
    const leadId = String(event.active.id)
    const status = findColumnOf(leadId)
    if (!status) return
    setActiveLead(grouped[status].find((lead) => lead.id === leadId) ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveLead(null)
    const { active, over } = event
    if (!over) return

    const leadId = String(active.id)
    const sourceStatus = findColumnOf(leadId)
    if (!sourceStatus) return

    const overId = String(over.id)
    const isColumn = KANBAN_COLUMNS.some((col) => col.status === overId)
    const targetStatus = (isColumn ? overId : findColumnOf(overId)) as LeadStatus | null
    if (!targetStatus || targetStatus === sourceStatus) return

    const lead = grouped[sourceStatus].find((l) => l.id === leadId)
    if (!lead) return

    setGrouped((prev) => ({
      ...prev,
      [sourceStatus]: prev[sourceStatus].filter((l) => l.id !== leadId),
      [targetStatus]: [{ ...lead, status: targetStatus }, ...prev[targetStatus]],
    }))

    updateLead.mutate(
      { id: leadId, patch: { status: targetStatus } },
      {
        onError: () => {
          toast.error("Não foi possível mover o lead. Tente novamente.")
          setGrouped(groupByStatus(leads))
        },
      },
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {KANBAN_COLUMNS.map((col) => (
          <KanbanColumn
            key={col.status}
            status={col.status}
            label={col.label}
            leads={grouped[col.status]}
            onSelectLead={onSelectLead}
          />
        ))}
      </div>

      <DragOverlay>
        {activeLead && <KanbanCard lead={activeLead} onClick={() => {}} />}
      </DragOverlay>
    </DndContext>
  )
}
