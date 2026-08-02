/**
 * SupabaseAIProvider (RFC-011).
 *
 * Implementação REAL e segura de `AIProvider` — substitui, para quem a usar
 * explicitamente, o stub `AnthropicProvider` (RFC-004) que só lança erro.
 * Nunca fala com a Anthropic diretamente: chama a Edge Function
 * `agent-ai-gateway` (contrato fechado, só a operação
 * `GENERATE_CONVERSATIONAL_RESPONSE` existe nesta fase) via o mesmo cliente
 * Supabase (`lib/supabase.ts`) já usado por `fetchSofiaReacao`/
 * `finalizeCandidate` em `lib/api.ts` — mesmo padrão de timeout
 * (`Promise.race`) usado lá.
 *
 * NUNCA:
 *   - conhece `ANTHROPIC_API_KEY` (só existe no servidor);
 *   - monta o prompt oficial da Sofia (isso é 100% server-side, ver
 *     `supabase/functions/_shared/agent-prompts.ts`);
 *   - envia texto livre pra Edge Function aceitar sem validação — o corpo
 *     enviado já é o contrato fechado (`operation`/`agentId`/`sessionId`/`input`).
 *
 * IMPORTANTE: esta classe NÃO é usada pelo `createDefaultAIGateway()` (que
 * continua com o `AnthropicProvider` stub, sem chamada real) nem por
 * `useSofiaFlow.ts` — só fica disponível para instanciação isolada
 * (testes, `createServerBackedAIGateway()`). Ligar isto ao chat real exige
 * uma RFC futura com autorização explícita.
 */
import { agentAiGatewayResponseSchema } from "@tania-joias/shared"
import { supabase } from "@/lib/supabase"
import type { AIProvider, AIRequest, AIResponse } from "./AIProvider"

export interface SupabaseAIProviderConfig {
  /** Correlação, não identidade/autenticação (ver Edge Function — "sessionId não é prova de identidade"). */
  sessionId: string
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 10_000

/** Chaves reconhecidas de `AIRequest.context` que viram campos estruturados do contrato — o restante vira `knownContext`. */
const CONTEXT_PASSTHROUGH_KEYS = ["currentObjective", "intent", "decision"] as const

export class SupabaseAIProvider implements AIProvider {
  readonly name = "supabase-agent-ai-gateway"
  private readonly sessionId: string
  private readonly timeoutMs: number

  constructor(config: SupabaseAIProviderConfig) {
    this.sessionId = config.sessionId
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    if (request.kind !== "response") {
      throw new Error(
        `[SupabaseAIProvider] operação "${request.kind}" não tem suporte na Edge Function ainda — só ` +
          `GENERATE_CONVERSATIONAL_RESPONSE ("response") existe nesta fase (RFC-011).`,
      )
    }

    const start = Date.now()
    const body = this.buildRequestBody(request)

    const invokePromise = supabase.functions.invoke("agent-ai-gateway", { body })
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`[SupabaseAIProvider] timeout após ${this.timeoutMs}ms`)), this.timeoutMs)
    })

    const { data, error } = await Promise.race([invokePromise, timeoutPromise])
    if (error) throw error

    const parsed = agentAiGatewayResponseSchema.parse(data)
    if (!parsed.success || !parsed.output) {
      throw new Error(
        `[SupabaseAIProvider] ${parsed.error?.code ?? "UNKNOWN"}: ${parsed.error?.message ?? "falha desconhecida"}`,
      )
    }

    return {
      content: parsed.output.message,
      provider: this.name,
      // O modelo real é decidido e fixado no servidor — o cliente nunca sabe qual é (RFC-011, Objetivo 6).
      model: "server-managed",
      latencyMs: Date.now() - start,
    }
  }

  /** Converte o `AIRequest` genérico do Gateway no contrato público restrito da Edge Function. */
  private buildRequestBody(request: AIRequest): Record<string, unknown> {
    const context = { ...(request.context ?? {}) }
    const passthrough: Record<string, string> = {}

    for (const key of CONTEXT_PASSTHROUGH_KEYS) {
      const value = context[key]
      if (typeof value === "string") {
        passthrough[key] = value
      }
      delete context[key]
    }

    return {
      operation: "GENERATE_CONVERSATIONAL_RESPONSE",
      agentId: "sofia",
      sessionId: this.sessionId,
      input: {
        userMessage: request.prompt,
        ...passthrough,
        ...(Object.keys(context).length > 0 ? { knownContext: context } : {}),
      },
    }
  }
}
