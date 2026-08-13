import { toast } from "sonner"
import { Copy, Loader2, MapPin, MessageCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { fichaLinkUrl, useGenerateFichaLink, useLeadFicha } from "@/hooks/useLeadFicha"
import { formatDateTime, googleMapsUrl, whatsappLinkWithMessage } from "@/lib/format"

interface FichaAprovacaoSectionProps {
  leadId: string
  leadNome: string
  leadTelefone: string
  leadWhatsapp: boolean | null
}

/** Mensagem amigável explicando o link da Ficha — a candidata precisa entender que é pra clicar e preencher, não só receber um link solto. */
function mensagemFicha(nome: string, token: string): string {
  const primeiroNome = nome.trim().split(/\s+/)[0] ?? ""
  return `Oi, ${primeiroNome}! 🌸\n\nVocê passou pra 2ª etapa do cadastro! Pra liberar seu Mostruário, é só clicar no link abaixo e preencher rapidinho sua Ficha de Aprovação:\n\n${fichaLinkUrl(token)}\n\nQualquer dúvida, é só chamar aqui! 💛`
}

function CampoPreenchido({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm text-foreground">{value || "—"}</p>
    </div>
  )
}

export function FichaAprovacaoSection({
  leadId,
  leadNome,
  leadTelefone,
  leadWhatsapp,
}: FichaAprovacaoSectionProps) {
  const { data: ficha, isLoading } = useLeadFicha(leadId)
  const generateLink = useGenerateFichaLink()

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
          <Button
            size="sm"
            variant="gold"
            className="w-full"
            disabled={!leadWhatsapp}
            onClick={() => {
              const link = whatsappLinkWithMessage(
                leadTelefone,
                mensagemFicha(leadNome, ficha.token),
              )
              if (link) window.open(link, "_blank", "noopener,noreferrer")
            }}
          >
            <MessageCircle className="size-3.5" />
            Mandar pelo WhatsApp
          </Button>
          <p className="text-xs text-muted-foreground">
            Abre o WhatsApp já com o link e uma mensagem explicando o próximo passo.
          </p>
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
