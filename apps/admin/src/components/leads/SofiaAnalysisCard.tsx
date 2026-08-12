import {
  AlertTriangle,
  CheckCircle2,
  PhoneCall,
  Sparkles,
} from "lucide-react"
import {
  MOTIVACAO_PRINCIPAL_LABEL,
  PERFIL_SUGERIDO_IA_LABEL,
  POTENCIAL_EMPREENDEDOR_LABEL,
  PROXIMA_ACAO_LABEL,
  SENTIMENTO_LABEL,
  type MotivacaoPrincipal,
  type PerfilSugeridoIa,
  type PotencialEmpreendedor,
  type ProximaAcao,
  type Sentimento,
} from "@tania-joias/shared"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import type { AiAnalysis } from "@/types"

interface SofiaAnalysisCardProps {
  analysis: AiAnalysis | null | undefined
}

export const PROXIMA_ACAO_VARIANT: Record<ProximaAcao, "success" | "gold" | "secondary"> = {
  ligar_imediatamente: "success",
  enviar_whatsapp: "success",
  analise_manual: "gold",
  aguardar: "secondary",
}

/** Barra de progresso simples (0-100), no mesmo estilo visual de IprBreakdown. */
function ScoreStat({ label, value }: { label: string; value: number }) {
  const color = value >= 80 ? "text-success" : value >= 50 ? "text-gold-foreground" : "text-muted-foreground"
  const barColor = value >= 80 ? "bg-success" : value >= 50 ? "bg-gold" : "bg-secondary-foreground/30"

  return (
    <div className="flex-1 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className={cn("text-sm font-semibold tabular-nums", color)}>{value}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div className={cn("h-full rounded-full", barColor)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
    </div>
  )
}

/** Card "Análise da Sofia" — leitura em <30s do parecer consultivo da IA sobre a candidata. Nunca substitui o motor de regras. */
export function SofiaAnalysisCard({ analysis }: SofiaAnalysisCardProps) {
  const hasAnalysis = Boolean(analysis?.icp_score != null)

  if (!hasAnalysis) {
    return (
      <Card className="border-gold/30">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-gold-foreground" />
            <CardTitle className="text-base">Análise da Sofia</CardTitle>
          </div>
          <CardDescription>
            A análise consultiva por IA não foi executada para esta candidata (recurso desligado ou
            candidata anterior a esta funcionalidade).
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const a = analysis!
  const pontosFortes = a.pontos_fortes ?? []
  const pontosAtencao = a.pontos_atencao ?? []
  const proximaAcao = a.proxima_acao as ProximaAcao | null
  const sentimento = a.sentimento as Sentimento | null
  const motivacaoPrincipal = a.motivacao_principal as MotivacaoPrincipal | null
  const potencialEmpreendedor = a.potencial_empreendedor as PotencialEmpreendedor | null
  const perfilSugeridoIa = a.perfil_sugerido_ia as PerfilSugeridoIa | null

  return (
    <Card className="border-gold/30">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-gold-foreground" />
          <CardTitle className="text-base">Análise da Sofia</CardTitle>
        </div>
        <CardDescription>
          Parecer consultivo da IA — não substitui a decisão da equipe nem o Perfil comercial oficial.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex gap-6">
          <ScoreStat label="ICP (compatibilidade de perfil)" value={a.icp_score ?? 0} />
          <ScoreStat label="Probabilidade de sucesso" value={a.probabilidade_sucesso ?? 0} />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {proximaAcao && (
            <Badge variant={PROXIMA_ACAO_VARIANT[proximaAcao]} className="gap-1">
              <PhoneCall className="size-3" />
              {PROXIMA_ACAO_LABEL[proximaAcao]}
            </Badge>
          )}
          {sentimento && <Badge variant="outline">{SENTIMENTO_LABEL[sentimento]}</Badge>}
          {motivacaoPrincipal && (
            <Badge variant="outline">{MOTIVACAO_PRINCIPAL_LABEL[motivacaoPrincipal]}</Badge>
          )}
          {potencialEmpreendedor && (
            <Badge variant="outline">
              Potencial empreendedor: {POTENCIAL_EMPREENDEDOR_LABEL[potencialEmpreendedor]}
            </Badge>
          )}
          {perfilSugeridoIa && (
            <Badge variant="outline">Opinião da IA: {PERFIL_SUGERIDO_IA_LABEL[perfilSugeridoIa]}</Badge>
          )}
        </div>

        {(pontosFortes.length > 0 || pontosAtencao.length > 0) && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <CheckCircle2 className="size-3.5 text-success" />
                Pontos fortes
              </p>
              {pontosFortes.length > 0 ? (
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {pontosFortes.map((ponto, i) => (
                    <li key={i}>• {ponto}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">Nenhum destaque identificado.</p>
              )}
            </div>
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <AlertTriangle className="size-3.5 text-gold-foreground" />
                Pontos de atenção
              </p>
              {pontosAtencao.length > 0 ? (
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {pontosAtencao.map((ponto, i) => (
                    <li key={i}>• {ponto}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">Nenhum ponto de atenção identificado.</p>
              )}
            </div>
          </div>
        )}

        <Tabs defaultValue="executivo">
          <TabsList>
            <TabsTrigger value="executivo">Executivo</TabsTrigger>
            <TabsTrigger value="comercial">Comercial</TabsTrigger>
            <TabsTrigger value="comportamental">Comportamental</TabsTrigger>
            <TabsTrigger value="motivacional">Motivacional</TabsTrigger>
          </TabsList>
          <TabsContent value="executivo" className="text-sm leading-relaxed text-muted-foreground">
            {a.resumo_executivo || "Sem resumo executivo."}
          </TabsContent>
          <TabsContent value="comercial" className="text-sm leading-relaxed text-muted-foreground">
            {a.resumo_comercial || "Sem resumo comercial."}
          </TabsContent>
          <TabsContent value="comportamental" className="text-sm leading-relaxed text-muted-foreground">
            {a.resumo_comportamental || "Sem resumo comportamental."}
          </TabsContent>
          <TabsContent value="motivacional" className="text-sm leading-relaxed text-muted-foreground">
            {a.resumo_motivacional || "Sem resumo motivacional."}
          </TabsContent>
        </Tabs>

        {a.grau_confianca_ia != null && (
          <p className="text-xs text-muted-foreground">
            Confiança da IA nesta análise: <span className="font-medium">{a.grau_confianca_ia}%</span>
            {a.grau_confianca_explicacao ? ` — ${a.grau_confianca_explicacao}` : ""}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
