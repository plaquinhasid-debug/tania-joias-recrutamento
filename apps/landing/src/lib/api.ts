import { supabase } from "@/lib/supabase"
import type { SofiaAnswers } from "@/types/sofia"
import {
  finalizeCandidateResponseSchema,
  getFichaResponseSchema,
  sofiaConfigResponseSchema,
  type Database,
  type FichaAprovacaoPayload,
  type FinalizeCandidatePayload,
  type FinalizeCandidateResponse,
  type GetFichaResponse,
  type NaturalConversationModeValue,
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
 * Busca as flags de comportamento da Sofia (Edge Function `sofia-config`).
 * Chamada uma vez por conversa (`useSofiaFlow.ts`, em `beginIntro`). Nunca
 * lança — qualquer falha, timeout, formato inesperado ou valor desconhecido
 * cai no fail-safe de cada campo (`perguntasIaAtiva: false`,
 * `conducaoNaturalModo: "OFF"`) — sempre o comportamento idêntico ao
 * roteiro fixo de hoje, nunca o oposto.
 *
 * A resposta é validada com `sofiaConfigResponseSchema` (via `.safeParse`,
 * nunca `.parse`) — mesmo se a Edge Function responder 200 com um formato
 * inesperado (deploy antigo, campo faltando, valor fora do enum), o
 * `safeParse` falha sem lançar e o catch abaixo nem chega a rodar; quem
 * decide o fallback aqui é sempre o `success: false` do Zod.
 */
export async function fetchSofiaConfig(): Promise<{
  perguntasIaAtiva: boolean
  /**
   * `undefined` quando a config não pôde ser lida de verdade (erro, timeout,
   * formato inesperado — ex.: uma Edge Function antiga sem este campo) —
   * distinto de um `"OFF"` real vindo do banco. `resolveNaturalConversationMode`
   * (`orchestrator/naturalConversation/resolveMode.ts`) trata os dois casos
   * como o mesmo comportamento (nunca reage), mas com `sourceTag` diferente
   * pro log (Objetivo 9 da Parte 5) — permite diferenciar "configurado como
   * OFF" de "não deu pra saber, ficou OFF por segurança".
   */
  conducaoNaturalModo: NaturalConversationModeValue | undefined
}> {
  const FALLBACK = { perguntasIaAtiva: false, conducaoNaturalModo: undefined }
  try {
    const invokePromise = supabase.functions.invoke("sofia-config", { body: {} })
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("sofia-config timeout")), SOFIA_CONFIG_TIMEOUT_MS)
    })
    const { data, error } = await Promise.race([invokePromise, timeoutPromise])
    if (error) throw error

    const parsed = sofiaConfigResponseSchema.safeParse(data)
    if (!parsed.success) {
      console.warn("[sofia] resposta de sofia-config em formato inesperado, usando fallback seguro", parsed.error)
      return FALLBACK
    }

    return {
      perguntasIaAtiva: parsed.data.perguntas_ia_ativa,
      conducaoNaturalModo: parsed.data.conducao_natural_modo,
    }
  } catch (err) {
    console.warn("[sofia] falha ao buscar configuração, usando fallback seguro", err)
    return FALLBACK
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

/**
 * Página pública `/ficha/:token` — checa se o link é válido, já foi
 * preenchido, ou está pendente. Pode lançar (a página trata o erro com uma
 * tela de "não deu pra carregar, tenta de novo").
 */
export async function getFicha(token: string): Promise<GetFichaResponse> {
  const { data, error } = await supabase.functions.invoke("get-ficha", { body: { token } })
  if (error) throw error
  return getFichaResponseSchema.parse(data)
}

/** Envia a Ficha de Aprovação preenchida. Pode lançar — a página trata o erro. */
export async function submitFicha(token: string, payload: FichaAprovacaoPayload): Promise<void> {
  const { error } = await supabase.functions.invoke("submit-ficha", {
    body: { token, ...payload },
  })
  if (error) throw error
}
