import type { LucideIcon } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface StatCardProps {
  label: string
  value: string
  icon: LucideIcon
  accent?: "default" | "gold" | "success" | "destructive"
}

const ACCENT_CLASSES: Record<NonNullable<StatCardProps["accent"]>, string> = {
  default: "bg-secondary text-foreground",
  gold: "bg-gold/15 text-gold-foreground",
  success: "bg-success/15 text-success",
  destructive: "bg-destructive/15 text-destructive",
}

export function StatCard({ label, value, icon: Icon, accent = "default" }: StatCardProps) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
        </div>
        <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", ACCENT_CLASSES[accent])}>
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  )
}

export function StatCardSkeleton() {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 p-5">
        <div className="w-full">
          <div className="h-3 w-20 animate-pulse rounded bg-secondary" />
          <div className="mt-2 h-7 w-16 animate-pulse rounded bg-secondary" />
        </div>
        <div className="size-10 shrink-0 animate-pulse rounded-lg bg-secondary" />
      </CardContent>
    </Card>
  )
}
