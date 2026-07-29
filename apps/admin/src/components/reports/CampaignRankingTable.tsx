import { Trophy } from "lucide-react"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState } from "@/components/common/EmptyState"
import { formatPercent } from "@/lib/format"
import type { DistributionItem } from "@/hooks/useReports"

export function CampaignRankingTable({ data }: { data: DistributionItem[] }) {
  if (data.length === 0) {
    return <EmptyState title="Nenhuma campanha registrada" />
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-10">#</TableHead>
          <TableHead>Campanha</TableHead>
          <TableHead>Leads</TableHead>
          <TableHead>Aprovadas</TableHead>
          <TableHead>Taxa de aprovação</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((item, index) => (
          <TableRow key={item.label}>
            <TableCell className="text-muted-foreground">
              {index === 0 ? <Trophy className="size-4 text-gold" /> : index + 1}
            </TableCell>
            <TableCell className="font-medium text-foreground">{item.label}</TableCell>
            <TableCell>{item.total}</TableCell>
            <TableCell>{item.aprovadas}</TableCell>
            <TableCell>{formatPercent(item.taxaAprovacao, 1)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
