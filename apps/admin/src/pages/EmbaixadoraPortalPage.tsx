import { Copy, LogOut, MessageCircle } from "lucide-react"
import { toast } from "sonner"

import { useAuth } from "@/context/AuthContext"
import { useMyEmbaixadora } from "@/hooks/useMyEmbaixadora"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { buildReferralUrl, buildWhatsappShareMessage, buildWhatsappShareUrl, copyReferralLink } from "@/lib/referralLink"

// IMPLEMENTATION-EMBAIXADORAS-E2.7-B/E2.8 — Portal Mínimo. Mostra SÓ os 3
// campos que `get-my-embaixadora` devolve (nome/status/codigo_referral) +
// sair, e agora (E2.8) o link pessoal de indicação (montado localmente a
// partir do `codigo_referral` já existente, sem chamada de rede nova).
// Fora de escopo, de propósito: indicações realizadas, conversões,
// recompensas, saldo, qualquer coisa do ConsigGold/R$40 — ver pedido da
// E2.8, seção "Não implementar ainda".

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
  const referralUrl = buildReferralUrl(codigo_referral)
  const whatsappShareUrl = buildWhatsappShareUrl(buildWhatsappShareMessage(referralUrl))

  async function handleCopy() {
    const copied = await copyReferralLink(referralUrl, (text) => navigator.clipboard.writeText(text))
    if (copied) toast.success("Link copiado")
    else toast.error("Não foi possível copiar. Selecione o link e copie manualmente.")
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary px-4 py-10">
      <div className="w-full max-w-sm space-y-4">
        <Card>
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

        <Card>
          <CardHeader>
            <CardTitle>Indique uma amiga</CardTitle>
            <CardDescription>
              Compartilhe seu link pessoal. Quem se cadastrar por ele fica associada a você.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="referral-link">Seu link de indicação</Label>
              <Input id="referral-link" readOnly autoComplete="off" value={referralUrl} onFocus={(event) => event.currentTarget.select()} />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="gold" className="w-full" asChild>
                <a href={whatsappShareUrl} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="size-4" />
                  Compartilhar pelo WhatsApp
                </a>
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={handleCopy}>
                <Copy className="size-4" />
                Copiar link
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
