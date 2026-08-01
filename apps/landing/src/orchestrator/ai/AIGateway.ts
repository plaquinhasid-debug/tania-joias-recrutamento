/**
 * AIGateway (RFC-004).
 *
 * Única porta de entrada permitida para qualquer comunicação com um modelo
 * de IA. Nenhum outro módulo (ActionEngine, Planner, Orchestrator) pode
 * conhecer Claude/Anthropic/OpenAI/Gemini diretamente — eles só pedem
 * "preciso de uma análise" ou "preciso gerar uma resposta" ao Gateway, que
 * decide qual provider usar, controla timeout/retry/erros e padroniza a
 * resposta.
 *
 * Trocar de provedor no futuro = trocar o `AIProvider` passado no
 * `createDefaultAIGateway()` — nenhum outro módulo precisa mudar.
 *
 * Nesta fase o Gateway não é chamado por ninguém (ver RFC-004: "o fluxo
 * ainda não será utilizado").
 */
import { createLogger } from "../devLog"
import type { AIProvider, AIRequest, AIResponse } from "./AIProvider"
import { AnthropicProvider } from "./AnthropicProvider"

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
 * mudar para trocar de provedor de IA no futuro.
 */
export function createDefaultAIGateway(): AIGateway {
  return new AIGateway({ provider: new AnthropicProvider() })
}
