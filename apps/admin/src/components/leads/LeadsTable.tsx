import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/common/EmptyState"
import { LeadStatusBadge } from "@/components/leads/LeadStatusBadge"
import { PerfilComercialBadge } from "@/components/leads/PerfilComercialBadge"
import { formatDate, formatPhone } from "@/lib/format"
import type { Lead } from "@/types"

const columnHelper = createColumnHelper<Lead>()

const columns = [
  columnHelper.accessor("nome", {
    header: "Nome",
    cell: (info) => <span className="font-medium text-foreground">{info.getValue()}</span>,
  }),
  columnHelper.accessor("cidade", {
    header: "Cidade",
    cell: (info) => info.getValue() ?? "—",
  }),
  columnHelper.accessor("telefone", {
    header: "Telefone",
    cell: (info) => formatPhone(info.getValue()),
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => <LeadStatusBadge status={info.getValue()} />,
  }),
  columnHelper.accessor("ipr", {
    header: "IPR",
    cell: (info) => <span className="tabular-nums">{info.getValue()}</span>,
  }),
  columnHelper.accessor("perfil_comercial", {
    header: "Perfil Comercial",
    cell: (info) => <PerfilComercialBadge perfil={info.getValue()} />,
  }),
  columnHelper.accessor("origem", {
    header: "Origem",
    cell: (info) => info.getValue() ?? "—",
  }),
  columnHelper.accessor("created_at", {
    header: "Data",
    cell: (info) => formatDate(info.getValue()),
  }),
]

interface LeadsTableProps {
  leads: Lead[]
  isLoading: boolean
  onSelectLead: (lead: Lead) => void
}

export function LeadsTable({ leads, isLoading, onSelectLead }: LeadsTableProps) {
  const table = useReactTable({
    data: leads,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card">
        <div className="space-y-3 p-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (leads.length === 0) {
    return (
      <EmptyState
        title="Nenhum lead encontrado"
        description="Ajuste os filtros ou aguarde novas candidatas chegarem pela Landing Page."
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              className="cursor-pointer"
              onClick={() => onSelectLead(row.original)}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
