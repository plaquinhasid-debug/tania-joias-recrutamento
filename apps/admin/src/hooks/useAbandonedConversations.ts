import { useQuery } from "@tanstack/react-query"

import { supabase } from "@/lib/supabase"

// Candidata só entra na lista depois de parada por esse tempo — evita
// mostrar quem está no meio da conversa agora mesmo como "abandonada".
const ABANDONMENT_THRESHOLD_MS = 30 * 60 * 1000

export interface AbandonedConversation {
  sessionId: string
  startedAt: string
  nome: string | null
  telefone: string | null
  cidade: string | null
  ultimaPergunta: string | null
  ultimaRespostaEm: string | null
}

/**
 * Reconstrói candidatas que começaram a conversa com a Sofia e nunca
 * terminaram (`conversations.completed_at IS NULL` e `lead_id IS NULL`),
 * cruzando com as respostas parciais já salvas em `answers` pelo mesmo
 * `session_id` — sem nenhuma tabela ou coluna nova (RFC-012).
 */
async function fetchAbandonedConversations(): Promise<AbandonedConversation[]> {
  const thresholdIso = new Date(Date.now() - ABANDONMENT_THRESHOLD_MS).toISOString()

  const { data: conversations, error: conversationsError } = await supabase
    .from("conversations")
    .select("session_id, started_at")
    .is("completed_at", null)
    .is("lead_id", null)
    .lt("started_at", thresholdIso)
    .order("started_at", { ascending: false })

  if (conversationsError) throw conversationsError
  if (!conversations || conversations.length === 0) return []

  const sessionIds = conversations.map((c) => c.session_id)

  const { data: answers, error: answersError } = await supabase
    .from("answers")
    .select("session_id, question_key, question_label, answer_value, created_at")
    .in("session_id", sessionIds)
    .order("created_at", { ascending: true })

  if (answersError) throw answersError

  return conversations.map((conv) => {
    const ownAnswers = (answers ?? []).filter((a) => a.session_id === conv.session_id)
    // findLast: `answers` permite múltiplas linhas pra mesma question_key
    // (RFC-012) — a mais recente é a que vale.
    const findAnswer = (key: string) =>
      ownAnswers.findLast((a) => a.question_key === key)?.answer_value ?? null
    const last = ownAnswers[ownAnswers.length - 1]

    return {
      sessionId: conv.session_id,
      startedAt: conv.started_at,
      nome: findAnswer("nome"),
      telefone: findAnswer("telefone"),
      cidade: findAnswer("cidade"),
      ultimaPergunta: last?.question_label ?? null,
      ultimaRespostaEm: last?.created_at ?? null,
    }
  })
}

export function useAbandonedConversations() {
  return useQuery({
    queryKey: ["abandoned-conversations"],
    queryFn: fetchAbandonedConversations,
    staleTime: 30_000,
  })
}
