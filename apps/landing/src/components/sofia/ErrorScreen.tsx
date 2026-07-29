import { AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"

interface ErrorScreenProps {
  message: string
  onRetry: () => void
}

export function ErrorScreen({ message, onRetry }: ErrorScreenProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-10 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-7" />
      </div>
      <p className="max-w-xs text-sm text-muted-foreground">{message}</p>
      <Button variant="gold" onClick={onRetry}>
        Tentar novamente
      </Button>
    </div>
  )
}
