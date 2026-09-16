import { useEffect, useId, useReducer, useRef, useState, type FormEvent } from "react"
import { Copy, Loader2, Plus } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { useCreateAmbassadorInvite } from "@/hooks/useCreateAmbassadorInvite"
import {
  copyInviteLink, initialInviteDialogState, inviteDialogReducer, InviteRequestError,
  INVITE_UNEXPECTED_ERROR, validateInviteFields,
} from "@/lib/ambassadorInvite"

export function ConvidarEmbaixadoraDialog() {
  const [open, setOpen] = useState(false)
  const [state, dispatch] = useReducer(inviteDialogReducer, undefined, initialInviteDialogState)
  const mounted = useRef(false)
  const id = useId()
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const invite = useCreateAmbassadorInvite((result) => {
    if (mounted.current) dispatch({ type: "success", result })
  })

  function handleOpenChange(nextOpen: boolean) {
    // Aguarda a resposta para não perder o único link durante o envio.
    if (invite.isSubmitting()) return
    dispatch({ type: "reset" })
    invite.reset()
    setOpen(nextOpen)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (invite.isSubmitting() || state.result) return
    const error = validateInviteFields(state.fields)
    dispatch({ type: "error", message: error })
    if (error) return
    try {
      await invite.submit(state.fields)
    } catch (error) {
      if (mounted.current) dispatch({
        type: "error", message: error instanceof InviteRequestError ? error.message : INVITE_UNEXPECTED_ERROR,
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
        <Button variant="gold"><Plus className="size-4" />Convidar Embaixadora</Button>
      </DialogTrigger>
      {open ? (
        <DialogContent showClose={!invite.isPending} className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{state.result ? "Convite criado" : "Convidar Embaixadora"}</DialogTitle>
            <DialogDescription>
              {state.result
                ? "Este link é exibido apenas agora. Copie e envie para a Embaixadora."
                : "Cadastre uma cliente para participar do Programa Embaixadoras."}
            </DialogDescription>
          </DialogHeader>
          {state.result ? (
            <>
              <dl className="space-y-3 text-sm">
                <div><dt className="text-muted-foreground">Embaixadora</dt><dd className="font-medium">{state.result.embaixadora.nome}</dd></div>
                <div><dt className="text-muted-foreground">Código de indicação</dt><dd className="font-mono">{state.result.embaixadora.codigo_referral}</dd></div>
              </dl>
              <div className="space-y-2">
                <Label htmlFor={`${id}-link`}>Link de convite</Label>
                <Input id={`${id}-link`} readOnly autoComplete="off" value={state.result.invite_url} onFocus={(event) => event.currentTarget.select()} />
                <Button type="button" variant="outline" onClick={handleCopy}><Copy className="size-4" />Copiar link</Button>
              </div>
              <DialogFooter><Button type="button" onClick={() => handleOpenChange(false)}>Fechar</Button></DialogFooter>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" aria-busy={invite.isPending}>
              <fieldset disabled={invite.isPending} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor={`${id}-nome`}>Nome *</Label>
                  <Input id={`${id}-nome`} required autoComplete="off" value={state.fields.nome} onChange={(event) => dispatch({ type: "field", field: "nome", value: event.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${id}-telefone`}>Telefone *</Label>
                  <Input id={`${id}-telefone`} type="tel" required autoComplete="off" placeholder="(11) 99999-9999" value={state.fields.telefone} onChange={(event) => dispatch({ type: "field", field: "telefone", value: event.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${id}-email`}>E-mail *</Label>
                  <Input id={`${id}-email`} type="email" required autoComplete="off" value={state.fields.email} onChange={(event) => dispatch({ type: "field", field: "email", value: event.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${id}-instagram`}>Instagram</Label>
                  <Input id={`${id}-instagram`} autoComplete="off" placeholder="usuario ou @usuario" value={state.fields.instagram} onChange={(event) => dispatch({ type: "field", field: "instagram", value: event.target.value })} />
                </div>
              </fieldset>
              {state.error ? <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p> : null}
              {invite.isPending ? <p role="status" className="text-sm text-muted-foreground">Criando convite. Aguarde antes de fechar.</p> : null}
              <DialogFooter>
                <Button type="button" variant="outline" disabled={invite.isPending} onClick={() => handleOpenChange(false)}>Cancelar</Button>
                <Button type="submit" variant="gold" disabled={invite.isPending}>
                  {invite.isPending ? <Loader2 className="size-4 animate-spin" /> : null}Enviar convite
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
