import { Loader2 } from "lucide-react"

export function LoadingScreen() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-10 text-center">
      <Loader2 className="size-8 animate-spin text-gold" />
      <p className="text-sm text-muted-foreground">
        Só um instante, estamos analisando o seu perfil...
      </p>
    </div>
  )
}
