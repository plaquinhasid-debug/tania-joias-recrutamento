// Edge Function: agent-ai-gateway (RFC-011)
//
// Ponte segura entre o AIGateway do frontend e a Anthropic. NÃO é um proxy
// genérico de prompts: só aceita operações estruturadas e pré-autorizadas
// (nesta RFC, só `GENERATE_CONVERSATIONAL_RESPONSE`). O browser nunca
// escolhe o modelo, o system prompt, os tools, os tokens de saída ou
// qualquer configuração livre da Anthropic — tudo isso é fixo aqui no
// servidor (`_shared/agent-prompts.ts`).
//
// IMPORTANTE (ver RFC-011, Objetivo 11 — modelo de autorização):
// `verify_jwt: false` nesta função, igual a `finalize-candidate` e
// `sofia-reagir` — a Landing é pública, candidatas não têm usuário
// autenticado, e este projeto já usa esse padrão para os outros endpoints
// chamados diretamente pela Landing. Isso significa que qualquer um que
// descubra a URL pode chamar esta função. As proteções aplicadas para
// compensar isso (documentadas em detalhe no relatório da RFC-011):
//   - contrato de entrada fechado (validação estrita, campos desconhecidos
//     são rejeitados, um único valor aceito por operação/agente);
//   - allowlist de origem (`AGENT_ALLOWED_ORIGINS`), fail-closed por padrão;
//   - limites de tamanho em cada campo e no payload inteiro;
//   - modelo, tokens de saída e timeout fixos no servidor;
//   - rate limiter em memória best-effort (ver aviso na função correspondente);
//   - resposta da Anthropic validada por tool-use forçado antes de sair daqui.
// Isto NÃO é proteção definitiva — é a primeira camada, proporcional ao MVP,
// e a função continua desligada do fluxo real da candidata nesta fase.
import {
  AgentAiError,
  type AgentAiErrorCode,
  generateConversationalResponse,
} from "../_shared/agent-prompts.ts"

// ---------------------------------------------------------------------------
// Contrato público (RFC-011, Objetivos 2/3)
// ---------------------------------------------------------------------------

type Operation = "GENERATE_CONVERSATIONAL_RESPONSE"
type AgentId = "sofia"

interface AgentAiGatewayRequestInput {
  userMessage: string
  currentObjective?: string
  knownContext?: Record<string, unknown>
  intent?: string
  decision?: string
}

interface AgentAiGatewayRequest {
  operation: Operation
  agentId: AgentId
  sessionId: string
  input: AgentAiGatewayRequestInput
}

type ErrorCode =
  | "INVALID_METHOD"
  | "ORIGIN_NOT_ALLOWED"
  | "INVALID_PAYLOAD"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_OPERATION"
  | "UNKNOWN_AGENT"
  | "AI_TIMEOUT"
  | "AI_RATE_LIMITED"
  | "AI_PROVIDER_ERROR"
  | "AI_INVALID_RESPONSE"
  | "INTERNAL_ERROR"

interface AgentAiGatewayResponse {
  success: boolean
  requestId: string
  operation: Operation
  output?: { message: string }
  usage?: { inputTokens?: number; outputTokens?: number }
  latencyMs: number
  /** `true` sempre que `success` é `false` — sinaliza que quem chamou deve seguir com o fluxo determinístico, nunca travar a candidata. */
  fallbackRequired: boolean
  error?: { code: ErrorCode; message: string; retryable: boolean }
}

// ---------------------------------------------------------------------------
// Limites (RFC-011, Objetivo 6) — nenhum destes pode ser alterado pelo cliente.
// ---------------------------------------------------------------------------

const MAX_PAYLOAD_BYTES = 20_000 // 20 KB
const MAX_SESSION_ID_LENGTH = 100
const MAX_USER_MESSAGE_LENGTH = 1000
const MAX_CURRENT_OBJECTIVE_LENGTH = 100
const MAX_INTENT_LENGTH = 40
const MAX_DECISION_LENGTH = 40
const MAX_KNOWN_CONTEXT_KEYS = 20
const MAX_CONTEXT_KEY_LENGTH = 60
const MAX_CONTEXT_VALUE_LENGTH = 300

// ---------------------------------------------------------------------------
// Mensagens públicas de erro — nunca expõem detalhe interno/da Anthropic.
// ---------------------------------------------------------------------------

const PUBLIC_ERROR_MESSAGES: Record<ErrorCode, string> = {
  INVALID_METHOD: "Método HTTP não suportado.",
  ORIGIN_NOT_ALLOWED: "Origem não autorizada.",
  INVALID_PAYLOAD: "Payload inválido.",
  PAYLOAD_TOO_LARGE: "Payload excede o tamanho permitido.",
  UNSUPPORTED_OPERATION: "Operação não suportada.",
  UNKNOWN_AGENT: "Agente desconhecido.",
  AI_TIMEOUT: "Tempo limite ao consultar o provedor de IA.",
  AI_RATE_LIMITED: "Limite de requisições atingido — tente novamente em instantes.",
  AI_PROVIDER_ERROR: "Falha no provedor de IA.",
  AI_INVALID_RESPONSE: "Resposta do provedor de IA fora do formato esperado.",
  INTERNAL_ERROR: "Erro interno.",
}

const RETRYABLE_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>(["AI_TIMEOUT", "AI_RATE_LIMITED"])

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  INVALID_METHOD: 405,
  ORIGIN_NOT_ALLOWED: 403,
  INVALID_PAYLOAD: 400,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_OPERATION: 400,
  UNKNOWN_AGENT: 400,
  AI_TIMEOUT: 504,
  AI_RATE_LIMITED: 429,
  AI_PROVIDER_ERROR: 502,
  AI_INVALID_RESPONSE: 502,
  INTERNAL_ERROR: 500,
}

// ---------------------------------------------------------------------------
// CORS + allowlist de origem (RFC-011, Objetivo 8)
// ---------------------------------------------------------------------------

function getAllowedOrigins(): string[] {
  const raw = Deno.env.get("AGENT_ALLOWED_ORIGINS") ?? ""
  return raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean)
}

/** Reflete a origem SOMENTE se ela estiver na allowlist — nunca usa `*`. Sem allowlist configurada = nenhuma origem é permitida (fail-closed). */
function buildCorsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  }
  if (origin && getAllowedOrigins().includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin
  }
  return headers
}

// ---------------------------------------------------------------------------
// Rate limiter em memória — BEST EFFORT, NÃO é proteção definitiva (RFC-011,
// Objetivo 7). Cada instância serverless tem seu próprio `Map`; reinicia a
// zero a cada cold start; não é compartilhado entre instâncias concorrentes.
// Serve só como um freio de custo/abuso grosseiro, nunca como controle de
// segurança confiável. Uma solução persistente (ex.: tabela no Postgres ou
// KV compartilhado) fica para uma RFC futura.
// ---------------------------------------------------------------------------

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 20
const rateLimitBuckets = new Map<string, { count: number; windowStart: number }>()

function isRateLimited(bucketKey: string): boolean {
  const now = Date.now()
  const bucket = rateLimitBuckets.get(bucketKey)
  if (!bucket || now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitBuckets.set(bucketKey, { count: 1, windowStart: now })
    return false
  }
  bucket.count++
  return bucket.count > RATE_LIMIT_MAX_REQUESTS
}

// ---------------------------------------------------------------------------
// Validação estrita do payload (RFC-011, Objetivo 2) — manual, sem depender
// de uma lib externa nova só para isto (consistente com o resto das Edge
// Functions do projeto). Rejeita qualquer campo não listado explicitamente.
// ---------------------------------------------------------------------------

const ALLOWED_TOP_LEVEL_KEYS = new Set(["operation", "agentId", "sessionId", "input"])
const ALLOWED_INPUT_KEYS = new Set(["userMessage", "currentObjective", "knownContext", "intent", "decision"])

type ValidationResult =
  | { ok: true; value: AgentAiGatewayRequest }
  | { ok: false; code: ErrorCode; detail: string }

function validateRequest(raw: unknown): ValidationResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, code: "INVALID_PAYLOAD", detail: "corpo deve ser um objeto JSON" }
  }
  const obj = raw as Record<string, unknown>

  for (const key of Object.keys(obj)) {
    if (!ALLOWED_TOP_LEVEL_KEYS.has(key)) {
      return { ok: false, code: "INVALID_PAYLOAD", detail: `campo não permitido: ${key}` }
    }
  }

  if (obj.operation !== "GENERATE_CONVERSATIONAL_RESPONSE") {
    return { ok: false, code: "UNSUPPORTED_OPERATION", detail: "operation não suportada" }
  }
  if (obj.agentId !== "sofia") {
    return { ok: false, code: "UNKNOWN_AGENT", detail: "agentId desconhecido" }
  }
  if (typeof obj.sessionId !== "string" || obj.sessionId.length < 1 || obj.sessionId.length > MAX_SESSION_ID_LENGTH) {
    return { ok: false, code: "INVALID_PAYLOAD", detail: "sessionId inválido" }
  }
  if (typeof obj.input !== "object" || obj.input === null || Array.isArray(obj.input)) {
    return { ok: false, code: "INVALID_PAYLOAD", detail: "input inválido" }
  }

  const input = obj.input as Record<string, unknown>
  for (const key of Object.keys(input)) {
    if (!ALLOWED_INPUT_KEYS.has(key)) {
      return { ok: false, code: "INVALID_PAYLOAD", detail: `campo não permitido em input: ${key}` }
    }
  }

  if (typeof input.userMessage !== "string" || input.userMessage.trim().length === 0) {
    return { ok: false, code: "INVALID_PAYLOAD", detail: "input.userMessage é obrigatório" }
  }
  if (input.userMessage.length > MAX_USER_MESSAGE_LENGTH) {
    return { ok: false, code: "PAYLOAD_TOO_LARGE", detail: "input.userMessage excede o tamanho máximo" }
  }

  if (input.currentObjective !== undefined) {
    if (typeof input.currentObjective !== "string" || input.currentObjective.length > MAX_CURRENT_OBJECTIVE_LENGTH) {
      return { ok: false, code: "INVALID_PAYLOAD", detail: "input.currentObjective inválido" }
    }
  }
  if (input.intent !== undefined) {
    if (typeof input.intent !== "string" || input.intent.length > MAX_INTENT_LENGTH) {
      return { ok: false, code: "INVALID_PAYLOAD", detail: "input.intent inválido" }
    }
  }
  if (input.decision !== undefined) {
    if (typeof input.decision !== "string" || input.decision.length > MAX_DECISION_LENGTH) {
      return { ok: false, code: "INVALID_PAYLOAD", detail: "input.decision inválido" }
    }
  }

  if (input.knownContext !== undefined) {
    if (typeof input.knownContext !== "object" || input.knownContext === null || Array.isArray(input.knownContext)) {
      return { ok: false, code: "INVALID_PAYLOAD", detail: "input.knownContext inválido" }
    }
    const entries = Object.entries(input.knownContext as Record<string, unknown>)
    if (entries.length > MAX_KNOWN_CONTEXT_KEYS) {
      return { ok: false, code: "PAYLOAD_TOO_LARGE", detail: "input.knownContext excede o número máximo de campos" }
    }
    for (const [key, value] of entries) {
      if (key.length > MAX_CONTEXT_KEY_LENGTH) {
        return { ok: false, code: "PAYLOAD_TOO_LARGE", detail: `chave de knownContext excede o tamanho máximo: ${key}` }
      }
      const tipo = typeof value
      if (tipo !== "string" && tipo !== "number" && tipo !== "boolean" && value !== null) {
        return { ok: false, code: "INVALID_PAYLOAD", detail: `tipo não suportado em knownContext.${key}` }
      }
      if (tipo === "string" && (value as string).length > MAX_CONTEXT_VALUE_LENGTH) {
        return { ok: false, code: "PAYLOAD_TOO_LARGE", detail: `valor de knownContext.${key} excede o tamanho máximo` }
      }
    }
  }

  return {
    ok: true,
    value: {
      operation: obj.operation as Operation,
      agentId: obj.agentId as AgentId,
      sessionId: obj.sessionId,
      input: {
        userMessage: input.userMessage,
        currentObjective: input.currentObjective as string | undefined,
        knownContext: input.knownContext as Record<string, unknown> | undefined,
        intent: input.intent as string | undefined,
        decision: input.decision as string | undefined,
      },
    },
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

function jsonResponse(body: AgentAiGatewayResponse, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function errorResponse(
  requestId: string,
  operation: Operation,
  code: ErrorCode,
  latencyMs: number,
  corsHeaders: Record<string, string>,
): Response {
  return jsonResponse(
    {
      success: false,
      requestId,
      operation,
      latencyMs,
      fallbackRequired: true,
      error: { code, message: PUBLIC_ERROR_MESSAGES[code], retryable: RETRYABLE_CODES.has(code) },
    },
    STATUS_BY_CODE[code],
    corsHeaders,
  )
}

function classifyThrown(err: unknown): { code: AgentAiErrorCode | "INTERNAL_ERROR" } {
  if (err instanceof AgentAiError) return { code: err.code }
  return { code: "INTERNAL_ERROR" }
}

/** Log estruturado e seguro — nunca grava API key, dados pessoais, prompt ou resposta completa (RFC-011, Objetivo 12). */
function logCall(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ fn: "agent-ai-gateway", ts: new Date().toISOString(), ...fields }))
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID()
  const start = Date.now()
  const origin = req.headers.get("origin")
  const corsHeaders = buildCorsHeaders(origin)
  const operation: Operation = "GENERATE_CONVERSATIONAL_RESPONSE"

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  if (origin === null || !getAllowedOrigins().includes(origin)) {
    logCall({ requestId, success: false, errorCode: "ORIGIN_NOT_ALLOWED", origin: origin ?? "(nenhuma)" })
    return errorResponse(requestId, operation, "ORIGIN_NOT_ALLOWED", Date.now() - start, corsHeaders)
  }
  // A partir daqui `origin` é garantidamente uma string permitida (narrowing do `if` acima).

  if (req.method !== "POST") {
    logCall({ requestId, success: false, errorCode: "INVALID_METHOD", method: req.method })
    return errorResponse(requestId, operation, "INVALID_METHOD", Date.now() - start, corsHeaders)
  }

  if (isRateLimited(origin)) {
    logCall({ requestId, success: false, errorCode: "AI_RATE_LIMITED", origin, reason: "gateway_rate_limit" })
    return errorResponse(requestId, operation, "AI_RATE_LIMITED", Date.now() - start, corsHeaders)
  }

  const rawBody = await req.text()
  const byteLength = new TextEncoder().encode(rawBody).length
  if (byteLength > MAX_PAYLOAD_BYTES) {
    logCall({ requestId, success: false, errorCode: "PAYLOAD_TOO_LARGE", bytes: byteLength })
    return errorResponse(requestId, operation, "PAYLOAD_TOO_LARGE", Date.now() - start, corsHeaders)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    logCall({ requestId, success: false, errorCode: "INVALID_PAYLOAD", reason: "json_parse_failed" })
    return errorResponse(requestId, operation, "INVALID_PAYLOAD", Date.now() - start, corsHeaders)
  }

  const validation = validateRequest(parsed)
  if (!validation.ok) {
    logCall({ requestId, success: false, errorCode: validation.code, reason: validation.detail })
    return errorResponse(requestId, operation, validation.code, Date.now() - start, corsHeaders)
  }

  const request = validation.value
  const sessionIdHash = await hashForLogs(request.sessionId)

  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY")
  if (!anthropicApiKey) {
    logCall({ requestId, success: false, errorCode: "AI_PROVIDER_ERROR", reason: "missing_api_key", sessionIdHash })
    return errorResponse(requestId, operation, "AI_PROVIDER_ERROR", Date.now() - start, corsHeaders)
  }

  try {
    const result = await generateConversationalResponse({
      apiKey: anthropicApiKey,
      userMessage: request.input.userMessage,
      currentObjective: request.input.currentObjective,
      knownContext: request.input.knownContext,
      intent: request.input.intent,
      decision: request.input.decision,
    })

    const latencyMs = Date.now() - start
    logCall({
      requestId,
      success: true,
      operation,
      agentId: request.agentId,
      sessionIdHash,
      latencyMs,
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
      messageLength: result.message.length,
    })

    return jsonResponse(
      {
        success: true,
        requestId,
        operation,
        output: { message: result.message },
        usage: result.usage,
        latencyMs,
        fallbackRequired: false,
      },
      200,
      corsHeaders,
    )
  } catch (err) {
    const latencyMs = Date.now() - start
    const { code } = classifyThrown(err)
    logCall({ requestId, success: false, errorCode: code, sessionIdHash, latencyMs })
    if (code === "INTERNAL_ERROR") {
      console.error(`[agent-ai-gateway] ${requestId} erro interno não classificado:`, err)
    }
    return errorResponse(requestId, operation, code, latencyMs, corsHeaders)
  }
})

/** Hash não reversível do sessionId só para correlacionar logs sem gravar o valor real (RFC-011, Objetivo 12). */
async function hashForLogs(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16)
}
