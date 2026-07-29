import { ArrowDown } from "lucide-react"

import { formatPercent } from "@/lib/format"
import type { RadarStep } from "@/hooks/useRadarFunil"

export function RadarStepsList({ steps }: { steps: RadarStep[] }) {
  return (
    <div className="space-y-0">
      {steps.map((step, index) => (
        <div key={step.evento}>
          <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">{step.label}</p>
              <p className="text-xs text-muted-foreground">
                {formatPercent(step.conversaoDoInicio, 1)} do início do funil
              </p>
            </div>
            <span className="text-xl font-semibold tabular-nums text-foreground">{step.total}</span>
          </div>
          {index < steps.length - 1 && (
            <div className="flex items-center justify-center gap-1.5 py-1.5 text-xs text-muted-foreground">
              <ArrowDown className="size-3.5" />
              {steps[index + 1].conversaoDoAnterior !== null
                ? `${formatPercent(steps[index + 1].conversaoDoAnterior ?? 0, 1)} avançam`
                : "sem dados"}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
