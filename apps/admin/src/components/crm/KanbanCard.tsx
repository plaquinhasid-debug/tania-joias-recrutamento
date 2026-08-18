import { useState, type MouseEvent } from "react"
import { toast } from "sonner"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ClipboardCheck, PhoneCall } from "lucide-react"
import { ETAPA_DETALHE_LABEL, PROXIMA_ACAO_LABEL, pipelineColumnKeyForLead } from "@tania-joias/shared"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PerfilComercialBadge } from "@/components/leads/PerfilComercialBadge"
import { PROXIMA_ACAO_VARIANT } from "@/components/leads/SofiaAnalysisCard"
import { cn } from "@/lib/utils"
import { formatDate, formatPhone, formatRelative, whatsappLinkWithMessage } from "@/lib/format"
import { WHATSAPP_DELIVERY_STATUS_LABEL } from "@/lib/whatsappStatus"
import {
  fichaPendente,
  fichaStatusForLead,
  latestProximaAcao,
  whatsappDeliveryStatusForLead,
  type LeadWithAnalysis,
} from "@/hooks/useLeads"
import { fichaLinkUrl, useGenerateFichaLink, useMarkManualContact } from "@/hooks/useLeadFicha"

/**
 * IMPLEMENTATION-CRM-002A — texto único usado pelo botão "Abrir WhatsApp",
 * revisado na 015D pra evitar linguagem de incentivo/desbloqueio
 * ("liberar seu Mostruário") que pode atrapalhar a classificação Utility
 * do template. Só abre o WhatsApp/WhatsApp Web pro operador mandar — nunca
 * chama a Cloud API.
 */
function mensagemContatoManual(nome: string, link: string): string {
  const primeiroNome = nome.trim().split(/\s+/)[0] ?? ""
  return `Oi, ${primeiroNome}! Seu cadastro avançou para a 2ª etapa. Para continuar, preencha sua Ficha de Aprovação no link abaixo:\n\n${link}`
}

const DELIVERY_BADGE_VARIANT: Record<string, "destructive" | "success" | "gold" | "outline"> = {
  failed: "destructive",
  read: "success",
  delivered: "success",
  sent: "gold",
  accepted: "gold",
  no_confirmation: "outline",
}

interface KanbanCardProps {
  lead: LeadWithAnalysis
  onClick: () => void
}

export function KanbanCard({ lead, onClick }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
  })
  const generateLink = useGenerateFichaLink()
  const markContact = useMarkManualContact()
  const [confirmandoContato, setConfirmandoContato] = useState(false)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const proximaAcao = latestProximaAcao(lead)
  const fichaStatus = fichaStatusForLead(lead)
  const etapaDetalhe = ETAPA_DETALHE_LABEL[pipelineColumnKeyForLead(lead)]
  const pendente = fichaPendente(lead)
  // IMPLEMENTATION-CRM-002A — as 19 leads aprovadas antigas sem ficha caem
  // aqui; cada uma revisada individualmente pelo botão abaixo, nunca em massa.
  const semFicha = lead.status === "aprovada" && lead.leads_ficha.length === 0
  const deliveryStatus = pendente ? whatsappDeliveryStatusForLead(lead) : null

  function handleGerarFicha(event: MouseEvent) {
    event.stopPropagation()
    if (generateLink.isPending) return
    generateLink.mutate(lead.id, {
      onError: () => toast.error("Não foi possível gerar o link da ficha."),
    })
  }

  function handleAbrirWhatsapp(event: MouseEvent) {
    event.stopPropagation()
    if (!pendente) return
    const link = whatsappLinkWithMessage(
      lead.telefone,
      mensagemContatoManual(lead.nome, fichaLinkUrl(pendente.token)),
    )
    if (link) window.open(link, "_blank", "noopener,noreferrer")
  }

  function handleCopiarLink(event: MouseEvent) {
    event.stopPropagation()
    if (!pendente) return
    navigator.clipboard.writeText(fichaLinkUrl(pendente.token))
    toast.success("Link copiado")
  }

  function handleIniciarConfirmacao(event: MouseEvent) {
    event.stopPropagation()
    setConfirmandoContato(true)
  }

  function handleCancelarConfirmacao(event: MouseEvent) {
    event.stopPropagation()
    setConfirmandoContato(false)
  }

  function handleConfirmarContato(event: MouseEvent) {
    event.stopPropagation()
    if (!pendente || markContact.isPending) return
    markContact.mutate(pendente.id, {
      onError: () => toast.error("Não foi possível registrar o contato manual."),
    })
    setConfirmandoContato(false)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "touch-none rounded-lg border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md",
        isDragging ? "cursor-grabbing opacity-50" : "cursor-grab",
      )}
      onClick={onClick}
    >
      <p className="text-sm font-medium text-foreground">{lead.nome}</p>
      <p className="mt-1 text-xs text-muted-foreground">{lead.cidade ?? "Cidade não informada"}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{formatPhone(lead.telefone)}</p>
      {etapaDetalhe && (
        <p className="mt-1 text-[11px] italic text-muted-foreground">{etapaDetalhe}</p>
      )}
      {proximaAcao && proximaAcao !== "aguardar" && (
        <Badge variant={PROXIMA_ACAO_VARIANT[proximaAcao]} className="mt-2 gap-1">
          <PhoneCall className="size-3" />
          {PROXIMA_ACAO_LABEL[proximaAcao]}
        </Badge>
      )}
      {fichaStatus === "preenchida" && (
        <Badge variant="success" className="mt-2 gap-1">
          <ClipboardCheck className="size-3" />
          Ficha preenchida
        </Badge>
      )}

      {semFicha && (
        <div className="mt-2 space-y-1.5" onClick={(event) => event.stopPropagation()}>
          <p className="text-[11px] text-muted-foreground">Ficha ainda não gerada</p>
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px]"
            disabled={generateLink.isPending}
            onClick={handleGerarFicha}
          >
            Gerar Ficha
          </Button>
        </div>
      )}

      {pendente && deliveryStatus && (
        <div className="mt-2 space-y-1.5" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between gap-2">
            <Badge variant={DELIVERY_BADGE_VARIANT[deliveryStatus.kind]}>
              {WHATSAPP_DELIVERY_STATUS_LABEL[deliveryStatus.kind]}
            </Badge>
            <span className="text-[11px] text-muted-foreground">
              {formatRelative(pendente.criado_em)}
            </span>
          </div>
          {deliveryStatus.kind === "failed" && deliveryStatus.errorCode && (
            <p className="text-[11px] text-destructive">Código Meta: {deliveryStatus.errorCode}</p>
          )}
          {pendente.contato_manual_em && (
            <p className="text-[11px] text-muted-foreground">
              Contato manual realizado {formatRelative(pendente.contato_manual_em)}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[11px]"
              disabled={lead.whatsapp !== true}
              onClick={handleAbrirWhatsapp}
            >
              Abrir WhatsApp
            </Button>
            <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={handleCopiarLink}>
              Copiar link
            </Button>
            {!confirmandoContato ? (
              <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={handleIniciarConfirmacao}>
                Marcar como contatada
              </Button>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">Confirma o contato?</span>
                <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={handleCancelarConfirmacao}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  variant="gold"
                  className="h-6 px-2 text-[11px]"
                  disabled={markContact.isPending}
                  onClick={handleConfirmarContato}
                >
                  Confirmar
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <PerfilComercialBadge perfil={lead.perfil_comercial} />
        <span className="text-xs font-medium tabular-nums text-muted-foreground">
          IPR {lead.ipr}
        </span>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">{formatDate(lead.created_at)}</p>
    </div>
  )
}
