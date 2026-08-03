import { supabase } from "@/lib/supabase"
import type { SofiaAnswers } from "@/types/sofia"
import {
  finalizeCandidateResponseSchema,
  type Database,
  type FinalizeCandidatePayload,
  type FinalizeCandidateResponse,
} from "@tania-joias/shared"

type EventoFunil = Database["public"]["Enums"]["evento_funil"]

/**
 * Eventos que a própria Edge Function `finalize-candidate` já registra
 * server-side. O frontend NUNCA deve gravar esses (evita duplicidade no
 * "Radar da Sofia" do admin).
 */
const EVENTOS_GRAVADOS_PELO_BACKEND = [
  "respondeu_trabalha_sim",
  "respondeu_trabalha_nao",
  "aprovada",
  "reprovada",
  "analise_manual",
] as const satisfies readonly EventoFunil[]

interface LogEventParams {
  tipoEvento: Exclude<EventoFunil, (typeof EVENTOS_GRAVADOS_PELO_BACKEND)[number]>
  sessionId?: string
  campanha?: string | null
  origem?: string | null
}

/** Grava um evento de funil em `logs`. Fire-and-forget: nunca lança. */
export async function logEvent({
  tipoEvento,
  sessionId,
  campanha,
  origem,
}: LogEventParams): Promise<void> {
  try {
    const { error } = await supabase.from("logs").insert({
      tipo_evento: tipoEvento,
      session_id: sessionId ?? null,
      campanha: campanha ?? null,
      origem: origem ?? null,
    })
    if (error) throw error
  } catch (err) {
    console.warn(`[sofia] falha ao registrar log "${tipoEvento}"`, err)
  }
}

interface InsertAnswerParams {
  sessionId: string
  questionKey: string
  questionLabel: string
  answerValue: string
}

/** Grava uma resposta individual em `answers`. Fire-and-forget: nunca lança. */
export async function insertAnswer({
  sessionId,
  questionKey,
  questionLabel,
  answerValue,
}: InsertAnswerParams): Promise<void> {
  try {
    const { error } = await supabase.from("answers").insert({
      session_id: sessionId,
      question_key: questionKey,
      question_label: questionLabel,
      answer_value: answerValue,
    })
    if (error) throw error
  } catch (err) {
    console.warn(`[sofia] falha ao salvar resposta "${questionKey}"`, err)
  }
}

interface StartConversationParams {
  sessionId: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmContent?: string
}

/** Registra o início de uma conversa em `conversations`. Fire-and-forget: nunca lança. */
export async function startConversation({
  sessionId,
  utmSource,
  utmMedium,
  utmCampaign,
  utmContent,
}: StartConversationParams): Promise<void> {
  try {
    const { error } = await supabase.from("conversations").insert({
      session_id: sessionId,
      status: "em_andamento",
      utm_source: utmSource ?? null,
      utm_medium: utmMedium ?? null,
      utm_campaign: utmCampaign ?? null,
      utm_content: utmContent ?? null,
    })
    if (error) throw error
  } catch (err) {
    console.warn("[sofia] falha ao iniciar conversation", err)
  }
}

interface SofiaReacaoParams {
  intent: "perguntar_proximo" | "fechar"
  campo: string
  valor: string
  proximaPerguntaBase?: string
  respostasAnteriores: SofiaAnswers
}

const SOFIA_REACAO_TIMEOUT_MS = 6000

/**
 * Busca uma reação contextual da Sofia (Edge Function `sofia-reagir`), usada
 * em só 2 pontos da conversa pra ela não soar como formulário. Nunca lança —
 * qualquer falha, timeout ou flag desligada resulta em `null`, e quem chama
 * cai no texto estático do roteiro (`sofia-script.ts`).
 */
export async function fetchSofiaReacao(params: SofiaReacaoParams): Promise<string | null> {
  try {
    const invokePromise = supabase.functions.invoke("sofia-reagir", { body: params })
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("sofia-reagir timeout")), SOFIA_REACAO_TIMEOUT_MS)
    })
    const { data, error } = await Promise.race([invokePromise, timeoutPromise])
    if (error) throw error

    const mensagem = (data as { mensagem?: unknown } | null)?.mensagem
    return typeof mensagem === "string" && mensagem.trim() ? mensagem.trim() : null
  } catch (err) {
    console.warn("[sofia] falha ao buscar reação contextual, usando texto padrão", err)
    return null
  }
}

const SOFIA_CONFIG_TIMEOUT_MS = 4000

/**
 * Busca as flags de comportamento da Sofia (Edge Function `sofia-config`,
 * FEATURE-004) — hoje só `perguntas_ia_ativa`. Chamada uma vez por
 * conversa (`useSofiaFlow.ts`, em `beginIntro`). Nunca lança — qualquer
 * falha, timeout ou flag ausente cai em `false` (fail-closed: comportamento
 * idêntico ao roteiro fixo de hoje).
 */
export async function fetchSofiaConfig(): Promise<{ perguntasIaAtiva: boolean }> {
  try {
    const invokePromise = supabase.functions.invoke("sofia-config", { body: {} })
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("sofia-config timeout")), SOFIA_CONFIG_TIMEOUT_MS)
    })
    const { data, error } = await Promise.race([invokePromise, timeoutPromise])
    if (error) throw error

    const ativa = (data as { perguntas_ia_ativa?: unknown } | null)?.perguntas_ia_ativa
    return { perguntasIaAtiva: ativa === true }
  } catch (err) {
    console.warn("[sofia] falha ao buscar configuração, perguntas por IA ficam desligadas", err)
    return { perguntasIaAtiva: false }
  }
}

/**
 * Chama a Edge Function `finalize-candidate`, que calcula o IPR e decide o
 * status do lead server-side. Esta é a ÚNICA chamada que pode lançar — o
 * chamador deve tratar o erro (ex.: tela de "tentar novamente").
 */
export async function finalizeCandidate(
  payload: FinalizeCandidatePayload,
): Promise<FinalizeCandidateResponse> {
  const { data, error } = await supabase.functions.invoke("finalize-candidate", {
    body: payload,
  })

  if (error) throw error

  return finalizeCandidateResponseSchema.parse(data)
}
