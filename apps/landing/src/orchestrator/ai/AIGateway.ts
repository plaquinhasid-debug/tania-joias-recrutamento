/**
 * AIGateway (RFC-004 / RFC-011).
 *
 * Única porta de entrada permitida para qualquer comunicação com um modelo
 * de IA. Nenhum outro módulo (ActionEngine, Planner, Orchestrator) pode
 * conhecer Claude/Anthropic/OpenAI/Gemini diretamente — eles só pedem
 * "preciso de uma análise" ou "preciso gerar uma resposta" ao Gateway, que
 * decide qual provider usar, controla timeout/retry/erros e padroniza a
 * resposta. O Gateway em si nunca conhece detalhes da Anthropic — só a
 * interface `AIProvider`.
 *
 * Trocar de provedor no futuro = trocar o `AIProvider` passado no
 * `createDefaultAIGateway()` — nenhum outro módulo precisa mudar.
 *
 * Nesta fase o Gateway não é chamado por ninguém em produção (RFC-004: "o
 * fluxo ainda não será utilizado"; RFC-011 criou uma implementação real de
 * `AIProvider` — `SupabaseAIProvider` — mas `createDefaultAIGateway()`
 * continua com o `AnthropicProvider` stub por padrão, exatamente como
 * antes. Ver `createServerBackedAIGateway()` abaixo para a versão que usa a
 * Edge Function de verdade — só para testes isolados, não conectada ao chat.
 */
import { createLogger } from "../devLog"
import type { AIProvider, AIRequest, AIResponse } from "./AIProvider"
import { AnthropicProvider } from "./AnthropicProvider"
import { SupabaseAIProvider } from "./SupabaseAIProvider"

const log = createLogger("[AIGateway]")

export interface AIGatewayConfig {
  provider: AIProvider
  timeoutMs?: number
  maxRetries?: number
}

const DEFAULT_TIMEOUT_MS = 20000
const DEFAULT_MAX_RETRIES = 1

export class AIGateway {
  private readonly provider: AIProvider
  private readonly timeoutMs: number
  private readonly maxRetries: number

  constructor(config: AIGatewayConfig) {
    this.provider = config.provider
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES
  }

  async request(request: AIRequest): Promise<AIResponse> {
    log("Solicitação recebida:", request)
    log("Modelo escolhido:", this.provider.name)

    let lastError: unknown
    const totalAttempts = this.maxRetries + 1

    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
      const start = Date.now()
      try {
        const response = await this.withTimeout(this.provider.generate(request), this.timeoutMs)
        log(`Tempo da resposta: ${Date.now() - start}ms`)
        return response
      } catch (err) {
        lastError = err
        log(`Erro (tentativa ${attempt}/${totalAttempts}):`, err)
        if (attempt < totalAttempts) {
          log("Retry...")
        }
      }
    }

    log("Sem mais retries — propagando erro final.")
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        log(`Timeout após ${ms}ms.`)
        reject(new Error(`[AIGateway] timeout após ${ms}ms`))
      }, ms)

      promise.then(
        (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        (err) => {
          clearTimeout(timer)
          reject(err)
        },
      )
    })
  }
}

/**
 * Fábrica com a configuração padrão da Sofia — o único lugar que precisa
 * mudar para trocar de provedor de IA no futuro. Continua usando o
 * `AnthropicProvider` stub (sem chamada real) — nada muda aqui na RFC-011.
 */
export function createDefaultAIGateway(): AIGateway {
  return new AIGateway({ provider: new AnthropicProvider() })
}

/**
 * Fábrica EXPLÍCITA (RFC-011) para testes reais contra a Edge Function
 * `agent-ai-gateway` — usa `SupabaseAIProvider` de verdade, não o stub.
 * Precisa de um `sessionId` porque o provider é escopado a uma sessão (a
 * Edge Function exige `sessionId` no contrato, só para correlação/logs,
 * nunca como prova de identidade).
 *
 * NUNCA chamada por `useSofiaFlow.ts` nem por qualquer código de produção —
 * só para uso isolado (scripts, testes manuais, Simulator). Trocar o
 * provider usado pelo chat real exige uma RFC futura com autorização
 * explícita (RFC-011, Objetivo 10: "não mudar silenciosamente o provider
 * utilizado pelo chat atual").
 */
export function createServerBackedAIGateway(sessionId: string): AIGateway {
  return new AIGateway({ provider: new SupabaseAIProvider({ sessionId }) })
}
