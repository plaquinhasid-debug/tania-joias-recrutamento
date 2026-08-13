import { X } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { DEFAULT_RADAR_FILTERS, type RadarFiltersState } from "@/hooks/useRadarFunil"

interface RadarFiltersProps {
  filters: RadarFiltersState
  onChange: (filters: RadarFiltersState) => void
}

export function RadarFilters({ filters, onChange }: RadarFiltersProps) {
  const hasActiveFilters = filters.dateFrom !== null || filters.dateTo !== null

  function patch(partial: Partial<RadarFiltersState>) {
    onChange({ ...filters, ...partial })
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-muted-foreground">De</label>
        <Input
          type="date"
          value={filters.dateFrom ?? ""}
          onChange={(e) => patch({ dateFrom: e.target.value || null })}
          className="w-[160px]"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-muted-foreground">Até</label>
        <Input
          type="date"
          value={filters.dateTo ?? ""}
          onChange={(e) => patch({ dateTo: e.target.value || null })}
          className="w-[160px]"
        />
      </div>

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={() => onChange(DEFAULT_RADAR_FILTERS)}>
          <X className="size-3.5" />
          Limpar filtro
        </Button>
      )}
    </div>
  )
}
