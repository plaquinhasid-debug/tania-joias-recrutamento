import * as React from "react"
import { toast } from "sonner"
import { CheckCircle2, Loader2, XCircle } from "lucide-react"
import { ETAPA_POS_APROVACAO_LABEL } from "@tania-joias/shared"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { FichaAprovacaoSection } from "@/components/leads/FichaAprovacaoSection"
import { TaniaAprovacaoSection } from "@/components/leads/TaniaAprovacaoSection"
import { LeadStatusBadge } from "@/components/leads/LeadStatusBadge"
import { PerfilComercialBadge } from "@/components/leads/PerfilComercialBadge"
import { IprBreakdown } from "@/components/leads/IprBreakdown"
import { SofiaAnalysisCard } from "@/components/leads/SofiaAnalysisCard"
import { useLead, useLeadAnalysis, useLeadAnswers, useUpdateLead } from "@/hooks/useLeadDetail"
import { formatDateTime, formatPhone } from "@/lib/format"
import type { IprBreakdown as IprBreakdownType } from "@/types"

interface LeadDetailDrawerProps {
  leadId: string | null
  onOpenChange: (open: boolean) => void
}

// QUALIFICACAO-002, Parte 1 — apresentação simples e neutra (nunca "boa/má
// candidata", "risco alto/baixo" etc.), só a regularidade autodeclarada.
const ESTABILIDADE_PROFISSIONAL_LABEL: Record<string, string> = {
  ALTA: "Alta",
  MEDIA: "Média",
  BAIXA: "Baixa",
}

export function LeadDetailDrawer({ leadId, onOpenChange }: LeadDetailDrawerProps) {
  const open = Boolean(leadId)
  const { data: lead, isLoading: leadLoading } = useLead(leadId ?? undefined)
  const { data: answers, isLoading: answersLoading } = useLeadAnswers(leadId ?? undefined)
  const { data: analysis, isLoading: analysisLoading } = useLeadAnalysis(leadId ?? undefined)
  const updateLead = useUpdateLead()

  const [observacoes, setObservacoes] = React.useState("")

  React.useEffect(() => {
    setObservacoes(lead?.observacoes ?? "")
  }, [lead?.id, lead?.observacoes])

  const observacoesDirty = (lead?.observacoes ?? "") !== observacoes

  // Mesmo resumo que a Sofia já escreveu sobre a candidata, reaproveitado na
  // mensagem final pra Tania — cai no resumo determinístico se a análise
  // expandida não estiver disponível.
  const resumoParaMensagem = analysis?.resumo_comercial || lead?.resumo_ia || ""

  async function handleStatusChange(status: "aprovada" | "reprovada") {
    if (!lead) return
    try {
      await updateLead.mutateAsync({
        id: lead.id,
        patch: { status },
        previousStatus: lead.status,
        leadWhatsapp: lead.whatsapp,
      })
      toast.success(status === "aprovada" ? "Lead aprovada." : "Lead reprovada.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível atualizar o status.")
    }
  }

  // RFC-INTELLIGENCE-006 — WhatsApp é obrigatório para aprovar (gate em
  // `useUpdateLead`, ver comentário de `leadWhatsapp` em `useLeadDetail.ts`).
  // Esta é a única forma de corrigir/confirmar o campo pelo Admin — sem
  // isso, uma lead com `whatsapp` false/nulo por engano (ou desatualizado)
  // ficaria travada sem nenhum caminho pra equipe liberar manualmente.
  async function handleConfirmWhatsapp() {
    if (!lead) return
    try {
      await updateLead.mutateAsync({ id: lead.id, patch: { whatsapp: true } })
      toast.success("WhatsApp confirmado.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível confirmar o WhatsApp.")
    }
  }

  async function handleSaveObservacoes() {
    if (!lead) return
    try {
      await updateLead.mutateAsync({ id: lead.id, patch: { observacoes } })
      toast.success("Observações salvas.")
    } catch {
      toast.error("Não foi possível salvar as observações.")
    }
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onOpenChange(false)}>
      <SheetContent className="w-full sm:max-w-xl">
        {leadLoading || !lead ? (
          <div className="space-y-4 p-6">
            <SheetTitle className="sr-only">Carregando detalhes do lead</SheetTitle>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <SheetTitle>{lead.nome}</SheetTitle>
                <LeadStatusBadge status={lead.status} />
              </div>
              <SheetDescription>
                {formatPhone(lead.telefone)} · {lead.cidade ?? "Cidade não informada"} ·
                Cadastrada em {formatDateTime(lead.created_at)}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
              {analysisLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <SofiaAnalysisCard analysis={analysis} />
              )}

              <Separator />

              <section>
                <h3 className="mb-2 text-sm font-semibold text-foreground">Perfil comercial</h3>
                <div className="flex items-center gap-2">
                  <PerfilComercialBadge perfil={lead.perfil_comercial} />
                </div>
                {analysisLoading ? (
                  <Skeleton className="mt-2 h-4 w-3/4" />
                ) : (
                  analysis?.perfil_motivo && (
                    <p className="mt-2 text-sm text-muted-foreground">{analysis.perfil_motivo}</p>
                  )
                )}
              </section>

              <Separator />

              <section>
                <h3 className="mb-2 text-sm font-semibold text-foreground">Resumo da IA</h3>
                {analysisLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {lead.resumo_ia || analysis?.resumo || "Nenhum resumo disponível."}
                  </p>
                )}
              </section>

              <Separator />

              <section>
                <h3 className="mb-3 text-sm font-semibold text-foreground">
                  Índice de Potencial da Revendedora
                </h3>
                {analysisLoading ? (
                  <Skeleton className="h-40 w-full" />
                ) : (
                  <IprBreakdown
                    score={lead.ipr}
                    breakdown={(analysis?.ipr_breakdown as IprBreakdownType | null) ?? null}
                  />
                )}
              </section>

              <Separator />

              <section>
                <h3 className="mb-2 text-sm font-semibold text-foreground">
                  Estabilidade profissional
                </h3>
                <p className="text-sm text-muted-foreground">
                  {ESTABILIDADE_PROFISSIONAL_LABEL[lead.estabilidade_profissional ?? ""] ??
                    "Não informada"}
                </p>
              </section>

              {lead.status === "aprovada" && (
                <>
                  <Separator />
                  <section>
                    <h3 className="mb-2 text-sm font-semibold text-foreground">
                      Etapa pós-aprovação
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {lead.etapa_pos_aprovacao
                        ? ETAPA_POS_APROVACAO_LABEL[lead.etapa_pos_aprovacao]
                        : "Aprovada — ainda não avançou (mova no Kanban)"}
                    </p>
                  </section>

                  <Separator />

                  <FichaAprovacaoSection
                    leadId={lead.id}
                    leadNome={lead.nome}
                    leadTelefone={lead.telefone}
                    leadWhatsapp={lead.whatsapp}
                  />

                  {(lead.etapa_pos_aprovacao === "confirmada" ||
                    lead.etapa_pos_aprovacao === "aguardando_tania") && (
                    <>
                      <Separator />
                      <TaniaAprovacaoSection
                        leadId={lead.id}
                        leadNome={lead.nome}
                        leadCidade={lead.cidade}
                        leadTelefone={lead.telefone}
                        leadEtapa={lead.etapa_pos_aprovacao}
                        leadPerfilComercial={lead.perfil_comercial}
                        resumoParaMensagem={resumoParaMensagem}
                      />
                    </>
                  )}
                </>
              )}

              <Separator />

              <section>
                <h3 className="mb-2 text-sm font-semibold text-foreground">
                  Histórico de respostas
                </h3>
                {answersLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : answers && answers.length > 0 ? (
                  <ul className="space-y-3">
                    {answers.map((answer) => (
                      <li key={answer.id} className="rounded-lg border border-border p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {answer.question_label}
                        </p>
                        <p className="mt-1 text-sm text-foreground">
                          {answer.answer_value || "—"}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma resposta registrada para esta candidata.
                  </p>
                )}
              </section>

              <Separator />

              <section>
                <h3 className="mb-2 text-sm font-semibold text-foreground">WhatsApp</h3>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={
                      lead.whatsapp === true
                        ? "border-success/40 text-success"
                        : "border-warning/40 text-warning"
                    }
                  >
                    {lead.whatsapp === true ? "Confirmado" : "Não confirmado"}
                  </Badge>
                  {lead.whatsapp !== true && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updateLead.isPending}
                      onClick={() => void handleConfirmWhatsapp()}
                    >
                      Confirmar WhatsApp
                    </Button>
                  )}
                </div>
                {lead.whatsapp !== true && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    A candidata respondeu que não tem WhatsApp nesse número (ou não informou).
                    WhatsApp é obrigatório — confirme antes de aprovar.
                  </p>
                )}
              </section>

              <Separator />

              <section>
                <h3 className="mb-2 text-sm font-semibold text-foreground">Observações</h3>
                <Textarea
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder="Anotações internas sobre esta candidata..."
                  rows={4}
                />
                {observacoesDirty && (
                  <Button
                    size="sm"
                    className="mt-2"
                    onClick={() => void handleSaveObservacoes()}
                    disabled={updateLead.isPending}
                  >
                    {updateLead.isPending && <Loader2 className="size-3.5 animate-spin" />}
                    Salvar observações
                  </Button>
                )}
              </section>
            </div>

            <SheetFooter className="flex-row flex-wrap gap-2">
              <Button
                variant="outline"
                className="flex-1 border-success/40 text-success hover:bg-success/10"
                disabled={updateLead.isPending || lead.status === "aprovada" || lead.whatsapp !== true}
                title={lead.whatsapp !== true ? "Confirme que a candidata possui WhatsApp antes de aprová-la." : undefined}
                onClick={() => void handleStatusChange("aprovada")}
              >
                <CheckCircle2 className="size-4" />
                Aprovar
              </Button>
              <Button
                variant="outline"
                className="flex-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                disabled={updateLead.isPending || lead.status === "reprovada"}
                onClick={() => void handleStatusChange("reprovada")}
              >
                <XCircle className="size-4" />
                Reprovar
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
