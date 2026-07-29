import * as React from "react"

import { PageHeader } from "@/components/common/PageHeader"
import { ErrorState } from "@/components/common/ErrorState"
import { LeadFilters } from "@/components/leads/LeadFilters"
import { LeadsTable } from "@/components/leads/LeadsTable"
import { LeadDetailDrawer } from "@/components/leads/LeadDetailDrawer"
import { DEFAULT_LEAD_FILTERS, useLeadOptions, useLeads } from "@/hooks/useLeads"
import { useRealtimeLeads } from "@/hooks/useRealtimeLeads"
import type { Lead, LeadFiltersState } from "@/types"

export default function LeadsPage() {
  useRealtimeLeads()
  const [filters, setFilters] = React.useState<LeadFiltersState>(DEFAULT_LEAD_FILTERS)
  const [selectedLeadId, setSelectedLeadId] = React.useState<string | null>(null)

  const { data: leads, isLoading, isError, refetch } = useLeads(filters)
  const { data: options } = useLeadOptions()

  function handleSelectLead(lead: Lead) {
    setSelectedLeadId(lead.id)
  }

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Todas as candidatas a revendedora captadas pela Landing Page."
      />

      <LeadFilters
        filters={filters}
        onChange={setFilters}
        origens={options?.origens ?? []}
        cidades={options?.cidades ?? []}
      />

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <LeadsTable leads={leads ?? []} isLoading={isLoading} onSelectLead={handleSelectLead} />
      )}

      <LeadDetailDrawer leadId={selectedLeadId} onOpenChange={(open) => !open && setSelectedLeadId(null)} />
    </div>
  )
}
