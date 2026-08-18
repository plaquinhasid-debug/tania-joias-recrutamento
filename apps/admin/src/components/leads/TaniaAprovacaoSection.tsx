import { toast } from "sonner"
import { MessageCircle, ThumbsDown, ThumbsUp } from "lucide-react"
import { PERFIL_COMERCIAL_LABEL, type EtapaPosAprovacao, type PerfilComercial } from "@tania-joias/shared"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useLeadFicha } from "@/hooks/useLeadFicha"
import { useUpdateLead } from "@/hooks/useLeadDetail"
import { formatPhone, googleMapsUrl, whatsappLinkWithMessage } from "@/lib/format"
import { decisaoTaniaDisponivel, etapaAposDecisaoTania } from "@/lib/taniaDecisionGate"

// Número pessoal da Tania — é pra ela mesma que vai a mensagem de aprovação
// final, fora do fluxo automático com a candidata.
const TANIA_TELEFONE = "11967660123"

interface TaniaAprovacaoSectionProps {
  leadId: string
  leadNome: string
  leadCidade: string | null
  leadTelefone: string
  leadEtapa: EtapaPosAprovacao | null
  leadPerfilComercial: PerfilComercial | null
  resumoParaMensagem: string
}

function mensagemParaTania(
  nome: string,
  cidade: string | null,
  telefone: string,
  perfilLabel: string | null,
  mapsUrl: string | null,
  resumo: string,
): string {
  const linhas = [
    `Oi Tania! A ${nome}${cidade ? ` (${cidade})` : ""} já foi aprovada pelo sistema e completou todo o cadastro — só está faltando sua aprovação final pra liberar o Mostruário pra ela.`,
    "",
    `📞 ${formatPhone(telefone)}`,
  ]
  if (perfilLabel) linhas.push(`⭐ Potencial: ${perfilLabel}`)
  if (mapsUrl) linhas.push(`📍 ${mapsUrl}`)
  if (resumo.trim()) linhas.push("", resumo.trim())
  linhas.push("", "Pode confirmar?")
  return linhas.join("\n")
}

export function TaniaAprovacaoSection({
  leadId,
  leadNome,
  leadCidade,
  leadTelefone,
  leadEtapa,
  leadPerfilComercial,
  resumoParaMensagem,
}: TaniaAprovacaoSectionProps) {
  const { data: ficha } = useLeadFicha(leadId)
  const updateLead = useUpdateLead()

  if (!decisaoTaniaDisponivel(leadEtapa)) {
    return null
  }

  function handleEnviarTania() {
    const mensagem = mensagemParaTania(
      leadNome,
      leadCidade,
      leadTelefone,
      leadPerfilComercial ? PERFIL_COMERCIAL_LABEL[leadPerfilComercial] : null,
      ficha ? googleMapsUrl(ficha) : null,
      resumoParaMensagem,
    )
    const link = whatsappLinkWithMessage(TANIA_TELEFONE, mensagem)
    if (link) window.open(link, "_blank", "noopener,noreferrer")

    updateLead
      .mutateAsync({ id: leadId, patch: { etapa_pos_aprovacao: "aguardando_tania" } })
      .catch(() => toast.error("Mensagem aberta, mas não deu pra mover o card. Mova manualmente."))
  }

  async function handleResposta(aprovou: boolean) {
    try {
      await updateLead.mutateAsync({
        id: leadId,
        patch: { etapa_pos_aprovacao: etapaAposDecisaoTania(aprovou) },
      })
      toast.success(aprovou ? "Lead marcada como Ativa." : "Lead marcada como Desistiu.")
    } catch {
      toast.error("Não foi possível atualizar a etapa.")
    }
  }

  // IMPLEMENTATION-CRM-003A — a decisão não pode depender do WhatsApp: a
  // Ficha já está preenchida sempre que este componente renderiza (é o que
  // leva a etapa a "confirmada"), então os botões de decisão ficam
  // disponíveis nos dois estados. "Enviar pra Tania" continua existindo, mas
  // como ação auxiliar/opcional — nunca um pré-requisito pra aprovar/recusar.
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-foreground">Aprovação final da Tania</h3>

      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Ficha preenchida. Aguardando decisão da Tania.
        </p>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 border-success/40 text-success hover:bg-success/10"
            disabled={updateLead.isPending}
            onClick={() => void handleResposta(true)}
          >
            <ThumbsUp className="size-3.5" />
            Tania aprovou
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 border-destructive/40 text-destructive hover:bg-destructive/10"
            disabled={updateLead.isPending}
            onClick={() => void handleResposta(false)}
          >
            <ThumbsDown className="size-3.5" />
            Tania recusou
          </Button>
        </div>

        <div className="border-t border-border pt-2">
          {leadEtapa === "aguardando_tania" && (
            <Badge variant="gold" className="mb-2">
              Mensagem já enviada pra Tania
            </Badge>
          )}
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={handleEnviarTania}
          >
            <MessageCircle className="size-3.5" />
            Enviar pra Tania (opcional)
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">
            Ação auxiliar — não é necessária pra aprovar ou recusar acima.
          </p>
        </div>
      </div>
    </section>
  )
}
