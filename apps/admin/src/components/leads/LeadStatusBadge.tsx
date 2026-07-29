import { LEAD_STATUS_COLOR, LEAD_STATUS_LABEL, type LeadStatus } from "@tania-joias/shared"

import { Badge } from "@/components/ui/badge"

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  const color = LEAD_STATUS_COLOR[status]
  return (
    <Badge
      variant="outline"
      style={{
        borderColor: `${color}55`,
        backgroundColor: `${color}1A`,
        color,
      }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
      {LEAD_STATUS_LABEL[status]}
    </Badge>
  )
}
