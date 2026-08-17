import type { KnowledgeDocument } from "./types"

export const SHADOW_PILOT_SLUGS = new Set([
  "comissao-por-faixa-de-valor-vendido",
  "garantia-por-tipo-de-peca",
  "prazo-referencia-consignacao-30-dias",
  "primeiro-mostruario-sem-caucao",
])

export const LOCAL_ID_TO_REMOTE_SLUG: Readonly<Record<string, string>> = {
  "com-001-comissao": "comissao-por-faixa-de-valor-vendido",
  "com-001-garantia": "garantia-por-tipo-de-peca",
  "com-001-consignacao": "prazo-referencia-consignacao-30-dias",
  "com-004-primeiro-mostruario": "primeiro-mostruario-sem-caucao",
}

export interface RemoteKnowledgeItem {
  knowledge_id: string
  slug: string
  category: string
  title: string
  content: string
  version: number
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

export function parseRemoteKnowledgeItems(value: unknown): RemoteKnowledgeItem[] {
  if (!Array.isArray(value)) throw new Error("remote_payload_not_array")
  return value.map((raw) => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("remote_item_not_object")
    const item = raw as Record<string, unknown>
    const allowedKeys = new Set(["knowledge_id", "slug", "category", "title", "content", "version"])
    if (Object.keys(item).some((key) => !allowedKeys.has(key))) throw new Error("remote_item_unexpected_field")
    if (!isNonEmptyString(item.knowledge_id) || !isNonEmptyString(item.slug) || !isNonEmptyString(item.category) ||
      !isNonEmptyString(item.title) || !isNonEmptyString(item.content) || !Number.isInteger(item.version) || Number(item.version) < 1) {
      throw new Error("remote_item_invalid_shape")
    }
    return item as unknown as RemoteKnowledgeItem
  })
}

export function comparePilotKnowledge(localDocuments: KnowledgeDocument[], remoteItems: RemoteKnowledgeItem[]) {
  const localSlugs = localDocuments.map((doc) => LOCAL_ID_TO_REMOTE_SLUG[doc.id])
    .filter((slug): slug is string => Boolean(slug) && SHADOW_PILOT_SLUGS.has(slug))
  const relevantRemote = remoteItems.filter((item) => SHADOW_PILOT_SLUGS.has(item.slug) && localSlugs.includes(item.slug))
  const remoteSlugs = relevantRemote.map((item) => item.slug)
  const remoteVersions = Object.fromEntries(relevantRemote.map((item) => [item.slug, item.version]))
  const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR")
  const agreement = localSlugs.length === 0 ? "not_applicable" :
    localDocuments.every((local) => {
      const slug = LOCAL_ID_TO_REMOTE_SLUG[local.id]
      if (!slug) return true
      const remote = relevantRemote.find((item) => item.slug === slug)
      return Boolean(remote) && normalize(local.conteudo) === normalize(remote!.content)
    }) ? "agreement" : "divergence"
  return { localSlugs, remoteSlugs, remoteVersions, agreement } as const
}
