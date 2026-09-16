import { Badge } from "@/components/ui/badge"
import type { EmbaixadoraStatus } from "@/hooks/useEmbaixadoras"

// IMPLEMENTATION-EMBAIXADORAS-E2.3-E — reaproveita as variantes já
// existentes do design system (`Badge`), sem criar cores/paleta paralela.
// Só os 4 status reais de `embaixadora_status_enum` — nenhum estado novo.
const STATUS_CONFIG: Record<EmbaixadoraStatus, { label: string; variant: "gold" | "success" | "secondary" | "destructive" }> = {
  convidada: { label: "Convite enviado", variant: "gold" },
  ativa: { label: "Ativa", variant: "success" },
  inativa: { label: "Inativa", variant: "secondary" },
  rejeitada: { label: "Rejeitada", variant: "destructive" },
}

export function EmbaixadoraStatusBadge({ status }: { status: EmbaixadoraStatus }) {
  const config = STATUS_CONFIG[status]
  return <Badge variant={config.variant}>{config.label}</Badge>
}
