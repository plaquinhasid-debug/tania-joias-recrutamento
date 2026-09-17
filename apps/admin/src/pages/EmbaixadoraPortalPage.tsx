import { LogOut } from "lucide-react"

import { useAuth } from "@/context/AuthContext"
import { useMyEmbaixadora } from "@/hooks/useMyEmbaixadora"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

// IMPLEMENTATION-EMBAIXADORAS-E2.7-B — Portal Mínimo. Mostra SÓ os 3 campos
// que `get-my-embaixadora` devolve (nome/status/codigo_referral) + sair.
// Fora de escopo desta etapa, de propósito: indicações, recompensas,
// saldo, link público de indicação, qualquer coisa do ConsigGold/R$40 —
// ver pedido da E2.7-B, seção "Não implemente ainda".

const STATUS_LABEL: Record<string, string> = {
  ativa: "Ativa",
}

export default function EmbaixadoraPortalPage() {
  const { signOut } = useAuth()
  const query = useMyEmbaixadora()

  if (query.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="size-8 animate-spin rounded-full border-2 border-border border-t-gold" />
      </div>
    )
  }

  // EmbaixadoraProtectedRoute já garante que só chegamos aqui com
  // `query.data` preenchido e `status==='ativa'` — este `null` é só
  // defesa adicional (ex.: um refetch em voo depois de expirar), nunca o
  // caminho esperado em uso normal.
  if (!query.data) return null

  const { nome, status, codigo_referral } = query.data

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Olá, {nome}</CardTitle>
          <CardDescription>Programa Embaixadoras Tania Jóias</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Status</p>
            <p className="font-medium text-foreground">{STATUS_LABEL[status] ?? status}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Seu código de indicação</p>
            <p className="font-mono text-lg font-medium tracking-wide text-foreground">{codigo_referral}</p>
          </div>
          <Button type="button" variant="outline" className="w-full" onClick={() => void signOut()}>
            <LogOut className="size-4" />
            Sair
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
