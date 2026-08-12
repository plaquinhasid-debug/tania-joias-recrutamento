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
import {
  PIPELINE_COLUMNS,
  patchForPipelineColumn,
  pipelineColumnKeyForLead,
  type PipelineColumnKey,
} from "@tania-joias/shared"

import { KanbanColumn } from "@/components/crm/KanbanColumn"
import { KanbanCard } from "@/components/crm/KanbanCard"
import { useUpdateLead } from "@/hooks/useLeadDetail"
import type { LeadWithAnalysis } from "@/hooks/useLeads"
import type { Lead } from "@/types"

type GroupedLeads = Record<PipelineColumnKey, LeadWithAnalysis[]>

function groupByColumn(leads: LeadWithAnalysis[]): GroupedLeads {
  const grouped = Object.fromEntries(
    PIPELINE_COLUMNS.map((col) => [col.key, [] as LeadWithAnalysis[]]),
  ) as GroupedLeads
  for (const lead of leads) {
    grouped[pipelineColumnKeyForLead(lead)]?.push(lead)
  }
  return grouped
}

interface KanbanBoardProps {
  leads: LeadWithAnalysis[]
  onSelectLead: (lead: Lead) => void
}

export function KanbanBoard({ leads, onSelectLead }: KanbanBoardProps) {
  const [grouped, setGrouped] = React.useState<GroupedLeads>(() => groupByColumn(leads))
  const [activeLead, setActiveLead] = React.useState<LeadWithAnalysis | null>(null)
  const updateLead = useUpdateLead()

  React.useEffect(() => {
    setGrouped(groupByColumn(leads))
  }, [leads])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  function findColumnOf(leadId: string): PipelineColumnKey | null {
    for (const col of PIPELINE_COLUMNS) {
      if (grouped[col.key].some((lead) => lead.id === leadId)) return col.key
    }
    return null
  }

  function handleDragStart(event: DragStartEvent) {
    const leadId = String(event.active.id)
    const columnKey = findColumnOf(leadId)
    if (!columnKey) return
    setActiveLead(grouped[columnKey].find((lead) => lead.id === leadId) ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveLead(null)
    const { active, over } = event
    if (!over) return

    const leadId = String(active.id)
    const sourceKey = findColumnOf(leadId)
    if (!sourceKey) return

    const overId = String(over.id)
    const isColumn = PIPELINE_COLUMNS.some((col) => col.key === overId)
    const targetKey = (isColumn ? overId : findColumnOf(overId)) as PipelineColumnKey | null
    if (!targetKey || targetKey === sourceKey) return

    const lead = grouped[sourceKey].find((l) => l.id === leadId)
    if (!lead) return

    const patch = patchForPipelineColumn(targetKey)

    setGrouped((prev) => ({
      ...prev,
      [sourceKey]: prev[sourceKey].filter((l) => l.id !== leadId),
      [targetKey]: [{ ...lead, ...patch }, ...prev[targetKey]],
    }))

    updateLead.mutate(
      { id: leadId, patch },
      {
        onError: () => {
          toast.error("Não foi possível mover o lead. Tente novamente.")
          setGrouped(groupByColumn(leads))
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
        {PIPELINE_COLUMNS.map((col) => (
          <KanbanColumn
            key={col.key}
            columnKey={col.key}
            label={col.label}
            color={col.color}
            leads={grouped[col.key]}
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
