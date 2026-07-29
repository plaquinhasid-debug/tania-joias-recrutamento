import { PERFIL_COMERCIAL_LABEL, type PerfilComercial } from "@tania-joias/shared"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const VARIANT: Record<PerfilComercial, "success" | "gold" | "secondary"> = {
  alto: "success",
  medio: "gold",
  baixo: "secondary",
}

export function PerfilComercialBadge({
  perfil,
  className,
}: {
  perfil: PerfilComercial | null
  className?: string
}) {
  if (!perfil) {
    return (
      <Badge variant="secondary" className={cn(className)}>
        Não avaliado
      </Badge>
    )
  }

  return (
    <Badge variant={VARIANT[perfil]} className={cn(className)}>
      {PERFIL_COMERCIAL_LABEL[perfil]}
    </Badge>
  )
}
