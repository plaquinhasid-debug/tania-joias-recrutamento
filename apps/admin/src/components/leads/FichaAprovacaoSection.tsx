import { toast } from "sonner"
import { Copy, Loader2, MapPin, MessageCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  fichaLinkUrl,
  sendFichaWhatsappSkipMessage,
  useGenerateFichaLink,
  useLeadFicha,
  useLeadFichaWhatsappMessages,
  useSendFichaWhatsapp,
} from "@/hooks/useLeadFicha"
import { formatDateTime, googleMapsUrl } from "@/lib/format"
import { deriveWhatsappDeliveryStatus, WHATSAPP_DELIVERY_STATUS_LABEL } from "@/lib/whatsappStatus"

interface FichaAprovacaoSectionProps {
  leadId: string
  leadWhatsapp: boolean | null
}

// Mesmo mapeamento de cor já usado em `KanbanCard.tsx` pro selo de status de
// entrega — duplicado aqui (não extraído pra `lib/whatsappStatus.ts`) porque
// é só uma constante de estilo, não lógica de negócio.
const DELIVERY_BADGE_VARIANT: Record<string, "destructive" | "success" | "gold" | "outline"> = {
  failed: "destructive",
  read: "success",
  delivered: "success",
  sent: "gold",
  accepted: "gold",
  no_confirmation: "outline",
}

function CampoPreenchido({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm text-foreground">{value || "—"}</p>
    </div>
  )
}

export function FichaAprovacaoSection({ leadId, leadWhatsapp }: FichaAprovacaoSectionProps) {
  const { data: ficha, isLoading } = useLeadFicha(leadId)
  const generateLink = useGenerateFichaLink()
  const sendFicha = useSendFichaWhatsapp()
  const { data: whatsappMessages } = useLeadFichaWhatsappMessages(leadId)

  async function handleGenerate() {
    try {
      await generateLink.mutateAsync(leadId)
      toast.success("Link da ficha gerado.")
    } catch {
      toast.error("Não foi possível gerar o link.")
    }
  }

  function handleCopyLink(token: string) {
    navigator.clipboard.writeText(fichaLinkUrl(token))
    toast.success("Link copiado!")
  }

  // IMPLEMENTATION-CRM-005A — substitui o antigo link manual pré-preenchido
  // (aberto em nova aba pro operador clicar "Enviar" dentro do WhatsApp)
  // por um envio de verdade via `send-whatsapp-ficha` (mesmo template
  // `ficha_aprovacao_link_utility` já validado no caminho automático). A
  // Edge Function já é idempotente (`already_sent`) — aqui só traduzimos o
  // resultado pra uma mensagem clara, nunca reimplementamos a checagem.
  async function handleSendWhatsapp() {
    try {
      const result = await sendFicha.mutateAsync(leadId)
      if (result.skipped) {
        toast.info(sendFichaWhatsappSkipMessage(result.reason))
        return
      }
      toast.success("Ficha enviada pelo WhatsApp!")
    } catch {
      toast.error("Não foi possível enviar a ficha. Tente novamente.")
    }
  }

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-foreground">Ficha de Aprovação</h3>

      {isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : !ficha ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Gere um link único pra candidata preencher endereço, referências e contatos.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleGenerate()}
            disabled={generateLink.isPending}
          >
            {generateLink.isPending && <Loader2 className="size-3.5 animate-spin" />}
            Gerar link da Ficha
          </Button>
        </div>
      ) : !ficha.preenchido_em ? (
        <div className="space-y-2">
          <Badge variant="gold">Aguardando preenchimento</Badge>
          <div className="flex items-center gap-2">
            <Input readOnly value={fichaLinkUrl(ficha.token)} className="text-xs" />
            <Button size="sm" variant="outline" onClick={() => handleCopyLink(ficha.token)}>
              <Copy className="size-3.5" />
              Copiar
            </Button>
          </div>
          {ficha.whatsapp_enviado_em ? (
            (() => {
              const deliveryStatus = deriveWhatsappDeliveryStatus({
                whatsappEnviadoEm: ficha.whatsapp_enviado_em,
                messages: whatsappMessages,
              })
              return (
                <div className="space-y-1">
                  <Badge variant={DELIVERY_BADGE_VARIANT[deliveryStatus.kind]} className="gap-1">
                    <MessageCircle className="size-3.5" />
                    {WHATSAPP_DELIVERY_STATUS_LABEL[deliveryStatus.kind]}
                  </Badge>
                  <p className="text-xs text-muted-foreground">
                    Ficha enviada pelo WhatsApp em {formatDateTime(ficha.whatsapp_enviado_em)}.
                  </p>
                </div>
              )
            })()
          ) : (
            <>
              <Button
                size="sm"
                variant="gold"
                className="w-full"
                disabled={!leadWhatsapp || sendFicha.isPending}
                onClick={() => void handleSendWhatsapp()}
              >
                {sendFicha.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <MessageCircle className="size-3.5" />
                )}
                Enviar ficha pelo WhatsApp
              </Button>
              <p className="text-xs text-muted-foreground">
                Envia o modelo aprovado pela Meta com o link da Ficha e passa a rastrear entrega/leitura
                automaticamente.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <Badge variant="success">Preenchida em {formatDateTime(ficha.preenchido_em)}</Badge>

          <div className="grid grid-cols-2 gap-3">
            <CampoPreenchido label="Endereço" value={`${ficha.endereco_rua}, ${ficha.endereco_numero}`} />
            <CampoPreenchido label="Bairro" value={ficha.endereco_bairro} />
            <CampoPreenchido label="Cidade" value={ficha.endereco_cidade} />
            <CampoPreenchido label="CEP" value={ficha.endereco_cep} />
            <CampoPreenchido label="Nome do pai" value={ficha.nome_pai} />
            <CampoPreenchido label="Nome da mãe" value={ficha.nome_mae} />
            <CampoPreenchido
              label="Trabalho"
              value={
                ficha.trabalha_atualmente
                  ? `${ficha.trabalho_endereco} · ${ficha.trabalho_telefone}`
                  : "Não trabalha atualmente"
              }
            />
          </div>

          <a
            href={googleMapsUrl(ficha) ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gold-foreground hover:underline"
          >
            <MapPin className="size-3.5" />
            Ver no Google Maps
          </a>

          {ficha.tem_conjuge && (
            <div className="grid grid-cols-2 gap-3">
              <CampoPreenchido
                label="Marido/companheiro"
                value={`${ficha.conjuge_nome} · ${ficha.conjuge_telefone}`}
              />
              <CampoPreenchido
                label="Trabalho dele"
                value={
                  ficha.conjuge_trabalha
                    ? `${ficha.conjuge_trabalho_local} · ${ficha.conjuge_trabalho_telefone}`
                    : "Não trabalha atualmente"
                }
              />
            </div>
          )}

          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Referências familiares
            </p>
            <ul className="space-y-1 text-sm text-foreground">
              <li>
                {ficha.ref1_nome} · {ficha.ref1_telefone}
              </li>
              <li>
                {ficha.ref2_nome} · {ficha.ref2_telefone}
              </li>
              <li>
                {ficha.ref3_nome} · {ficha.ref3_telefone}
              </li>
            </ul>
          </div>

          <CampoPreenchido
            label="Referência comercial"
            value={`${ficha.ref_comercial_o_que_vende} — ${ficha.ref_comercial_nome} · ${ficha.ref_comercial_telefone}`}
          />
        </div>
      )}
    </section>
  )
}
