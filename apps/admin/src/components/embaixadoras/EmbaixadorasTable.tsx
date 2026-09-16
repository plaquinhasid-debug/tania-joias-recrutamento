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
import { EmbaixadoraStatusBadge } from "@/components/embaixadoras/EmbaixadoraStatusBadge"
import { formatDate, formatInstagram, formatTelefoneNormalizado } from "@/lib/format"
import type { EmbaixadoraAdmin } from "@/hooks/useEmbaixadoras"

const columnHelper = createColumnHelper<EmbaixadoraAdmin>()

const columns = [
  columnHelper.accessor("nome", {
    header: "Embaixadora",
    cell: (info) => <span className="font-medium text-foreground">{info.getValue()}</span>,
  }),
  columnHelper.display({
    id: "contato",
    header: "Contato",
    cell: (info) => (
      <div className="flex flex-col">
        <span>{formatTelefoneNormalizado(info.row.original.telefone_normalizado)}</span>
        <span className="text-xs text-muted-foreground">{info.row.original.email}</span>
      </div>
    ),
  }),
  columnHelper.accessor("instagram", {
    header: "Instagram",
    cell: (info) => formatInstagram(info.getValue()),
  }),
  columnHelper.accessor("codigo_referral", {
    header: "Código de indicação",
    cell: (info) => <span className="font-mono text-xs tracking-wide">{info.getValue()}</span>,
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => <EmbaixadoraStatusBadge status={info.getValue()} />,
  }),
  columnHelper.accessor("created_at", {
    header: "Cadastro",
    cell: (info) => formatDate(info.getValue()),
  }),
]

interface EmbaixadorasTableProps {
  embaixadoras: EmbaixadoraAdmin[]
  isLoading: boolean
}

export function EmbaixadorasTable({ embaixadoras, isLoading }: EmbaixadorasTableProps) {
  const table = useReactTable({
    data: embaixadoras,
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

  if (embaixadoras.length === 0) {
    return (
      <EmptyState
        title="Nenhuma embaixadora ainda"
        description="As participantes do Programa Embaixadoras aparecerão aqui."
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
            <TableRow key={row.id}>
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
