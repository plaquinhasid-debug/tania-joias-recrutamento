import { Search, X } from "lucide-react"
import { LEAD_STATUS_LABEL, PERFIL_COMERCIAL_LABEL } from "@tania-joias/shared"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { LeadFiltersState } from "@/types"
import { DEFAULT_LEAD_FILTERS } from "@/hooks/useLeads"

interface LeadFiltersProps {
  filters: LeadFiltersState
  onChange: (filters: LeadFiltersState) => void
  origens: string[]
  cidades: string[]
}

export function LeadFilters({ filters, onChange, origens, cidades }: LeadFiltersProps) {
  const hasActiveFilters =
    filters.search !== "" ||
    filters.status !== "todos" ||
    filters.perfilComercial !== "todos" ||
    filters.origem !== "todos" ||
    filters.cidade !== "todos" ||
    filters.dateFrom !== null ||
    filters.dateTo !== null

  function patch(partial: Partial<LeadFiltersState>) {
    onChange({ ...filters, ...partial })
  }

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => patch({ search: e.target.value })}
            placeholder="Buscar por nome, telefone ou cidade..."
            className="pl-9"
          />
        </div>

        <Select value={filters.status} onValueChange={(value) => patch({ status: value })}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {Object.entries(LEAD_STATUS_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.perfilComercial}
          onValueChange={(value) => patch({ perfilComercial: value })}
        >
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Perfil comercial" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os perfis</SelectItem>
            {Object.entries(PERFIL_COMERCIAL_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.origem} onValueChange={(value) => patch({ origem: value })}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Origem" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as origens</SelectItem>
            {origens.map((origem) => (
              <SelectItem key={origem} value={origem}>
                {origem}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.cidade} onValueChange={(value) => patch({ cidade: value })}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Cidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as cidades</SelectItem>
            {cidades.map((cidade) => (
              <SelectItem key={cidade} value={cidade}>
                {cidade}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-3">
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
          <Button variant="ghost" size="sm" onClick={() => onChange(DEFAULT_LEAD_FILTERS)}>
            <X className="size-3.5" />
            Limpar filtros
          </Button>
        )}
      </div>
    </div>
  )
}
