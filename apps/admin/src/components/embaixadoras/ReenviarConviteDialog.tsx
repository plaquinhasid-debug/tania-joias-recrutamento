import { useEffect, useId, useReducer, useRef, useState } from "react"
import { Copy, Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { useResendAmbassadorInvite } from "@/hooks/useResendAmbassadorInvite"
import {
  copyInviteLink, initialResendDialogState, resendDialogReducer, ResendInviteRequestError,
  RESEND_UNEXPECTED_ERROR,
} from "@/lib/ambassadorInvite"
import type { EmbaixadoraAdmin } from "@/hooks/useEmbaixadoras"

interface ReenviarConviteDialogProps {
  embaixadora: Pick<EmbaixadoraAdmin, "id" | "nome" | "status" | "updated_at">
}

/**
 * Só renderiza o gatilho quando `status === 'convidada'` — reforço de UI do
 * mesmo bloqueio que já é a autoridade real no banco (RPC
 * resend_ambassador_invite, WHERE status='convidada'). Uma Embaixadora
 * `ativa`/`inativa`/`rejeitada` nunca vê este botão.
 */
export function ReenviarConviteDialog({ embaixadora }: ReenviarConviteDialogProps) {
  const [open, setOpen] = useState(false)
  const [state, dispatch] = useReducer(resendDialogReducer, undefined, initialResendDialogState)
  const mounted = useRef(false)
  const id = useId()
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const resend = useResendAmbassadorInvite((result) => {
    if (mounted.current) dispatch({ type: "success", result })
  })

  if (embaixadora.status !== "convidada") return null

  function handleOpenChange(nextOpen: boolean) {
    // Mesma proteção de ConvidarEmbaixadoraDialog: aguarda a resposta para
    // não perder o único link durante o envio.
    if (resend.isSubmitting()) return
    dispatch({ type: "reset" })
    resend.reset()
    setOpen(nextOpen)
  }

  async function handleConfirm() {
    if (resend.isSubmitting() || state.result) return
    try {
      await resend.submit({ embaixadoraId: embaixadora.id, expectedUpdatedAt: embaixadora.updated_at })
    } catch (error) {
      if (mounted.current) dispatch({
        type: "error", message: error instanceof ResendInviteRequestError ? error.message : RESEND_UNEXPECTED_ERROR,
      })
    }
  }

  async function handleCopy() {
    if (!state.result) return
    const copied = await copyInviteLink(state.result.invite_url, (text) => navigator.clipboard.writeText(text))
    if (!mounted.current) return
    if (copied) toast.success("Link copiado")
    else toast.error("Não foi possível copiar. Selecione o link e copie manualmente.")
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><RefreshCw className="size-4" />Reenviar convite</Button>
      </DialogTrigger>
      {open ? (
        <DialogContent showClose={!resend.isPending} className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{state.result ? "Novo convite gerado" : "Reenviar convite"}</DialogTitle>
            <DialogDescription>
              {state.result
                ? "Este link é exibido apenas agora. Copie e envie para a Embaixadora."
                : `O link anterior de "${embaixadora.nome}" deixará de funcionar assim que um novo for gerado. Confirmar?`}
            </DialogDescription>
          </DialogHeader>
          {state.result ? (
            <>
              <div className="space-y-2">
                <Label htmlFor={`${id}-link`}>Link de convite</Label>
                <Input id={`${id}-link`} readOnly autoComplete="off" value={state.result.invite_url} onFocus={(event) => event.currentTarget.select()} />
                <Button type="button" variant="outline" onClick={handleCopy}><Copy className="size-4" />Copiar link</Button>
              </div>
              <DialogFooter><Button type="button" onClick={() => handleOpenChange(false)}>Fechar</Button></DialogFooter>
            </>
          ) : (
            <>
              {state.error ? <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p> : null}
              {resend.isPending ? <p role="status" className="text-sm text-muted-foreground">Gerando novo convite. Aguarde antes de fechar.</p> : null}
              <DialogFooter>
                <Button type="button" variant="outline" disabled={resend.isPending} onClick={() => handleOpenChange(false)}>Cancelar</Button>
                <Button type="button" variant="gold" disabled={resend.isPending} onClick={handleConfirm}>
                  {resend.isPending ? <Loader2 className="size-4 animate-spin" /> : null}Gerar novo link
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
