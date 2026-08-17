import { mapPublicKnowledgeRpcResponse } from "./contract.ts"

export type KnowledgeServiceLogCode =
  | "remote_configuration_missing"
  | "remote_rpc_failed"
  | "remote_invalid_response"

export interface KnowledgeServiceDependencies {
  allowedOrigins: readonly string[]
  readPublicKnowledge: () => Promise<unknown>
  logError?: (code: KnowledgeServiceLogCode) => void
}
function cors(origin: string | null, allowedOrigins: readonly string[]): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  }
  if (origin && allowedOrigins.includes(origin)) headers["Access-Control-Allow-Origin"] = origin
  return headers
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } })
}

export function createKnowledgeServiceHandler(dependencies: KnowledgeServiceDependencies) {
  return async (req: Request): Promise<Response> => {
    const headers = cors(req.headers.get("origin"), dependencies.allowedOrigins)
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers })
    if (!headers["Access-Control-Allow-Origin"]) return json({ error: "origin_not_allowed" }, 403, headers)
    if (req.method !== "GET" && req.method !== "POST") return json({ error: "method_not_allowed" }, 405, headers)

    if (req.method === "GET" && new URL(req.url).search !== "") {
      return json({ error: "parameters_not_allowed" }, 400, headers)
    }
    if (req.method === "POST") {
      const text = await req.text()
      if (text.trim() && text.trim() !== "{}") return json({ error: "parameters_not_allowed" }, 400, headers)
    }

    try {
      const data = await dependencies.readPublicKnowledge()
      return json(mapPublicKnowledgeRpcResponse(data), 200, headers)
    } catch (error) {
      const code: KnowledgeServiceLogCode = error instanceof Error && error.message === "remote_configuration_missing"
        ? "remote_configuration_missing"
        : error instanceof Error && error.message === "remote_rpc_failed"
          ? "remote_rpc_failed"
          : "remote_invalid_response"
      dependencies.logError?.(code)
      return json({ error: "knowledge_unavailable" }, 502, headers)
    }
  }
}
