import * as React from "react"

import { PageHeader } from "@/components/common/PageHeader"
import { ErrorState } from "@/components/common/ErrorState"
import { EmptyState } from "@/components/common/EmptyState"
import { Skeleton } from "@/components/ui/skeleton"
import { KanbanBoard } from "@/components/crm/KanbanBoard"
import { LeadDetailDrawer } from "@/components/leads/LeadDetailDrawer"
import { DEFAULT_LEAD_FILTERS, useLeads } from "@/hooks/useLeads"
import { useRealtimeLeads } from "@/hooks/useRealtimeLeads"
import type { Lead } from "@/types"

export default function CrmPage() {
  useRealtimeLeads()
  const { data: leads, isLoading, isError, refetch } = useLeads(DEFAULT_LEAD_FILTERS)
  const [selectedLeadId, setSelectedLeadId] = React.useState<string | null>(null)

  return (
    <div>
      <PageHeader
        title="CRM"
        description="Arraste os cards entre as colunas para atualizar o status da candidata."
      />

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[420px] w-80 shrink-0 rounded-xl" />
          ))}
        </div>
      ) : !leads || leads.length === 0 ? (
        <EmptyState
          title="Nenhum lead ainda"
          description="Assim que novas candidatas responderem o chat da Landing Page, elas aparecem aqui."
        />
      ) : (
        <KanbanBoard leads={leads} onSelectLead={(lead: Lead) => setSelectedLeadId(lead.id)} />
      )}

      <LeadDetailDrawer
        leadId={selectedLeadId}
        onOpenChange={(open) => !open && setSelectedLeadId(null)}
      />
    </div>
  )
}
