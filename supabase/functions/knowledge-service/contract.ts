export interface PublicKnowledgeContract {
  knowledge_id: string
  slug: string
  category: string
  title: string
  content: string
  version: number
}
const RPC_KEYS = new Set(["knowledge_id", "slug", "categoria", "titulo", "conteudo", "version_number"])

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

export function mapPublicKnowledgeRpcResponse(value: unknown): PublicKnowledgeContract[] {
  if (!Array.isArray(value)) throw new Error("RPC response must be an array")
  return value.map((raw) => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("Invalid RPC item")
    const item = raw as Record<string, unknown>
    if (Object.keys(item).some((key) => !RPC_KEYS.has(key))) throw new Error("Unexpected RPC field")
    if (
      !nonEmpty(item.knowledge_id) || !nonEmpty(item.slug) || !nonEmpty(item.categoria) ||
      !nonEmpty(item.titulo) || !nonEmpty(item.conteudo) || !Number.isInteger(item.version_number) ||
      Number(item.version_number) < 1
    ) throw new Error("Invalid RPC item shape")
    return {
      knowledge_id: item.knowledge_id,
      slug: item.slug,
      category: item.categoria,
      title: item.titulo,
      content: item.conteudo,
      version: Number(item.version_number),
    }
  })
}
