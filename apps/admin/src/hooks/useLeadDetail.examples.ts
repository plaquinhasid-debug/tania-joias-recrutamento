/**
 * Cenários executáveis de `podeAprovarManualmente` (RFC-INTELLIGENCE-006,
 * ajustado após revisão de diff — decisão do Antonio de proteger só a
 * PRIMEIRA transição para "aprovada"). Mesmo padrão já usado em
 * `classifyForFeature004.examples.ts` (`check(nome, esperado, obtido)`).
 * Cobre a proteção da aprovação manual no Admin (Kanban + botão "Aprovar"
 * do LeadDetailDrawer, ambos passando por `useUpdateLead`).
 */
import { podeAprovarManualmente } from "./useLeadDetail"

export interface LeadDetailExampleResult {
  name: string
  passou: boolean
  detalhe: string
}

export function runUseLeadDetailExamples(): LeadDetailExampleResult[] {
  const resultados: LeadDetailExampleResult[] = []

  function check(name: string, esperado: unknown, obtido: unknown) {
    const passou = JSON.stringify(esperado) === JSON.stringify(obtido)
    resultados.push({ name, passou, detalhe: `esperado=${JSON.stringify(esperado)} obtido=${JSON.stringify(obtido)}` })
  }

  // 1-3. Lead AINDA NÃO aprovada, tentando entrar em "aprovada" pela primeira vez.
  check(
    "1. Não aprovada + whatsapp=false -> NÃO entra em aprovada",
    false,
    podeAprovarManualmente("aprovada", "em_analise", false),
  )
  check(
    "2. Não aprovada + whatsapp=null -> NÃO entra em aprovada",
    false,
    podeAprovarManualmente("aprovada", "em_analise", null),
  )
  check(
    "3. Não aprovada + whatsapp=true -> pode entrar em aprovada",
    true,
    podeAprovarManualmente("aprovada", "em_analise", true),
  )

  // 4-6. Lead JÁ aprovada, movimentação interna do pipeline pós-aprovação
  // (patchForPipelineColumn sempre reenvia status="aprovada" + nova etapa) —
  // nunca deve ser bloqueada por este gate, mesmo sem WhatsApp confirmado.
  check(
    "4. Já aprovada + whatsapp=false -> pode avançar entre etapas pós-aprovação",
    true,
    podeAprovarManualmente("aprovada", "aprovada", false),
  )
  check(
    "5. Já aprovada + whatsapp=null -> pode avançar entre etapas pós-aprovação",
    true,
    podeAprovarManualmente("aprovada", "aprovada", null),
  )
  check(
    "6. Já aprovada + whatsapp=true -> fluxo normal",
    true,
    podeAprovarManualmente("aprovada", "aprovada", true),
  )

  // Regressão dos cenários já cobertos antes do ajuste.
  check(
    "Regressão. Patch de 'reprovada' nunca é bloqueado pelo gate de WhatsApp",
    true,
    podeAprovarManualmente("reprovada", "novo", false),
  )
  check(
    "Regressão. Patch sem status (ex.: só observações) nunca é bloqueado",
    true,
    podeAprovarManualmente(undefined, "novo", false),
  )
  check(
    "Regressão. Confirmar WhatsApp (patch sem status) nunca é bloqueado",
    true,
    podeAprovarManualmente(undefined, "em_analise", false),
  )

  return resultados
}
