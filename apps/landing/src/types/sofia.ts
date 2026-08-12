import type { FinalizeCandidateResponse } from "@tania-joias/shared"

/** Dados coletados ao longo da conversa com a Sofia — vai virando o payload final. */
export interface SofiaAnswers {
  nome?: string
  cidade?: string
  idade?: number
  telefone?: string
  trabalha?: boolean
  empresa_atual?: string
  profissao?: string
  /** QUALIFICACAO-002, Parte 1 — texto bruto do chip escolhido. Normalizado pra ALTA/MEDIA/BAIXA só no servidor. */
  estabilidade_profissional?: string
  experiencia_vendas?: boolean
  whatsapp?: boolean
  possui_instagram?: boolean
  instagram?: string | null
  tempo_disponivel?: string
  objetivo?: string
}

export type SofiaAnswerKey = keyof SofiaAnswers

export interface SofiaMessage {
  id: string
  role: "bot" | "user"
  text: string
  /** Horário de exibição (HH:MM), estilo WhatsApp — só para a UI, não persistido. */
  time: string
}

/** Fase atual da máquina de estados do chat. */
export type SofiaPhase =
  | "intro"
  | "asking"
  | "closing"
  | "submitting"
  | "result"
  | "error"
  // FEATURE-005 Parte 7.1: candidata encerrou a conversa antes do fim
  // (END_CONVERSATION) — terminal, nunca chama finalize-candidate.
  | "abandoned"

export interface SofiaFlowSnapshot {
  phase: SofiaPhase
  messages: SofiaMessage[]
  answers: SofiaAnswers
  result: FinalizeCandidateResponse | null
  errorMessage: string | null
  reachedEnd: boolean
}
