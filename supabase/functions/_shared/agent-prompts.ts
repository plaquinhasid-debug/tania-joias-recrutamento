// _shared/agent-prompts.ts (RFC-011)
//
// Constrói o prompt da operação GENERATE_CONVERSATIONAL_RESPONSE e chama a
// Anthropic — SEMPRE com tool-use forçado, nunca confiando em texto livre.
// Usado só pela Edge Function `agent-ai-gateway`. Segue o mesmo padrão já
// usado em `sofia-reacao.ts`/`ai-analysis.ts` (fetch direto à Messages API,
// tool_choice forçado, timeout via AbortSignal).
//
// DUPLICAÇÃO DELIBERADA (RFC-011, Objetivo 4): `SOFIA_SERVER_PROFILE` abaixo
// é um espelho MÍNIMO e server-side do `AgentProfile` real da Sofia
// (`apps/landing/src/orchestrator/agent/profiles/sofia.ts`, RFC-009/010).
// Edge Functions Deno não importam código do bundle Vite/React — runtimes e
// resoluções de módulo incompatíveis — então não há hoje uma fonte única
// entre frontend e backend para a identidade da Sofia. Se o perfil mudar no
// frontend (tom, missão, limitações), este bloco precisa ser atualizado
// manualmente. Unificar as duas fontes é uma melhoria válida para uma RFC
// futura (ex.: uma tabela `agent_profiles` no Supabase, lida por ambos os
// lados), não implementada aqui.

export type AgentAiErrorCode = "AI_TIMEOUT" | "AI_RATE_LIMITED" | "AI_PROVIDER_ERROR" | "AI_INVALID_RESPONSE"

export class AgentAiError extends Error {
  readonly code: AgentAiErrorCode
  constructor(code: AgentAiErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

export interface GenerateConversationalResponseInput {
  apiKey: string
  userMessage: string
  currentObjective?: string
  knownContext?: Record<string, unknown>
  intent?: string
  decision?: string
}

export interface GenerateConversationalResponseResult {
  message: string
  usage?: { inputTokens?: number; outputTokens?: number }
}

/** Fixo no servidor — nunca vem do cliente (RFC-011, Objetivo 6). */
export const CLAUDE_MODEL = "claude-haiku-4-5-20251001"
const ANTHROPIC_VERSION = "2023-06-01"
const REQUEST_TIMEOUT_MS = 8000
const MAX_OUTPUT_TOKENS = 300
/** 1 tentativa + 1 retry — só em timeout/erro 5xx da Anthropic, nunca em rate limit ou resposta malformada (RFC-011, Objetivo 6). */
const MAX_ANTHROPIC_ATTEMPTS = 2

const SOFIA_SERVER_PROFILE = {
  role: "Consultora Oficial de Recrutamento",
  mission: "Encontrar mulheres com maior potencial para se tornarem excelentes revendedoras da Tania Joias.",
  tone: [
    "Elegante",
    "Natural",
    "Profissional",
    "Empático",
    "Objetivo",
    "Nunca infantil",
    "Nunca agressivo",
    "Nunca insistente",
  ],
  limitations: [
    "Não aprova candidatas",
    "Não reprova candidatas",
    "Não altera regras",
    "Não modifica banco",
    "Não cria conhecimento",
    "Não responde usando informações não verificadas",
  ],
} as const

const RETURN_AGENT_MESSAGE_TOOL = {
  name: "return_agent_message",
  description: "Registra a mensagem que a Sofia deve responder à candidata nesta operação.",
  input_schema: {
    type: "object",
    properties: {
      message: {
        type: "string",
        description: "1 a 3 linhas curtas, no tom oficial da Sofia — nunca um bloco grande de texto.",
      },
    },
    required: ["message"],
    additionalProperties: false,
  },
} as const

function buildSystemPrompt(): string {
  return [
    `Você é Sofia, ${SOFIA_SERVER_PROFILE.role} da Tania Joias (empresa de revenda de semijoias).`,
    `Missão: ${SOFIA_SERVER_PROFILE.mission}`,
    `Tom: ${SOFIA_SERVER_PROFILE.tone.join(", ")}.`,
    `Você NUNCA: ${SOFIA_SERVER_PROFILE.limitations.join("; ")}.`,
    "Nunca invente informações que não foram fornecidas. Nunca prometa ganhos ou valores específicos. " +
      "Nunca tome ou sugira que está tomando uma decisão de aprovação/reprovação — isso é sempre responsabilidade " +
      "exclusiva de um sistema de regras separado e determinístico, fora do seu controle.",
    "Responda sempre em português do Brasil, no máximo 3 linhas curtas, de forma natural — nunca como um formulário.",
    "Responda SEMPRE usando a ferramenta `return_agent_message` — nunca escreva texto livre fora dela.",
  ].join("\n")
}

function buildUserPrompt(input: GenerateConversationalResponseInput): string {
  const linhas: string[] = []
  if (input.currentObjective) linhas.push(`Objetivo atual do roteiro: ${input.currentObjective}`)
  if (input.intent) linhas.push(`Intenção já classificada para esta mensagem: ${input.intent}`)
  if (input.decision) linhas.push(`Decisão já tomada pelo motor de decisão determinístico: ${input.decision}`)
  if (input.knownContext && Object.keys(input.knownContext).length > 0) {
    const contexto = Object.entries(input.knownContext)
      .map(([chave, valor]) => `${chave}: ${valor}`)
      .join("; ")
    linhas.push(`Contexto já conhecido sobre a candidata: ${contexto}`)
  }
  linhas.push(`Mensagem da candidata: "${input.userMessage}"`)
  linhas.push("Gere a próxima fala da Sofia usando a ferramenta return_agent_message.")
  return linhas.join("\n")
}

function normalizeAnthropicError(err: unknown): AgentAiError {
  if (err instanceof AgentAiError) return err
  if (err instanceof DOMException && err.name === "TimeoutError") {
    return new AgentAiError("AI_TIMEOUT", "Tempo limite ao chamar a Anthropic.")
  }
  return new AgentAiError("AI_PROVIDER_ERROR", "Falha ao chamar a Anthropic.")
}

async function callAnthropicOnce(
  input: GenerateConversationalResponseInput,
): Promise<GenerateConversationalResponseResult> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": input.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: buildSystemPrompt(),
      messages: [{ role: "user", content: buildUserPrompt(input) }],
      tools: [RETURN_AGENT_MESSAGE_TOOL],
      tool_choice: { type: "tool", name: RETURN_AGENT_MESSAGE_TOOL.name },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (response.status === 429) {
    throw new AgentAiError("AI_RATE_LIMITED", "Limite de requisições da Anthropic atingido.")
  }
  if (!response.ok) {
    throw new AgentAiError("AI_PROVIDER_ERROR", `Anthropic respondeu com status ${response.status}.`)
  }

  const data = await response.json()
  const toolUse = (data?.content as Array<Record<string, unknown>> | undefined)?.find(
    (block) => block.type === "tool_use" && block.name === RETURN_AGENT_MESSAGE_TOOL.name,
  )
  const message = (toolUse?.input as { message?: unknown } | undefined)?.message

  if (typeof message !== "string" || !message.trim()) {
    throw new AgentAiError("AI_INVALID_RESPONSE", "Resposta da Anthropic fora do formato esperado.")
  }

  const usage = data?.usage as { input_tokens?: number; output_tokens?: number } | undefined

  return {
    message: message.trim(),
    usage: usage ? { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens } : undefined,
  }
}

/**
 * Chama a Anthropic e devolve a mensagem estruturada da Sofia. Lança
 * `AgentAiError` (nunca um erro genérico) — quem chama decide o código
 * HTTP/contrato público a partir de `err.code`. Faz até
 * `MAX_ANTHROPIC_ATTEMPTS` tentativas, e só tenta de novo em timeout ou erro
 * 5xx da Anthropic (nunca em rate limit — não adianta tentar de novo na
 * hora — nem em resposta malformada — repetir o mesmo prompt determinístico
 * tem baixa chance de corrigir sozinho).
 */
export async function generateConversationalResponse(
  input: GenerateConversationalResponseInput,
): Promise<GenerateConversationalResponseResult> {
  let attempt = 0
  while (true) {
    attempt++
    try {
      return await callAnthropicOnce(input)
    } catch (err) {
      const normalized = normalizeAnthropicError(err)
      const podeTentarDeNovo =
        attempt < MAX_ANTHROPIC_ATTEMPTS &&
        (normalized.code === "AI_TIMEOUT" || normalized.code === "AI_PROVIDER_ERROR")
      if (!podeTentarDeNovo) throw normalized
    }
  }
}
