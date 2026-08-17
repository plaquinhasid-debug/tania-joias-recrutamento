import type { KnowledgeRepository } from "./KnowledgeRepository"
import { LOCAL_ID_TO_REMOTE_SLUG, SHADOW_PILOT_SLUGS } from "./ShadowKnowledgeCore.ts"
import type { KnowledgeDocument } from "./types"

const REMOTE_TIMEOUT_MS = 2_500

export type PilotFallbackReason =
  | "remote_timeout"
  | "remote_invalid_payload"
  | "remote_unavailable"
  | "remote_slug_missing"

export interface PilotKnowledgeEvent {
  mode: "PILOT"
  remoteAvailable: boolean
  latencyMs: number
  slug: string
  version?: number
  source: "REMOTE_PILOT" | "LOCAL_FALLBACK"
  fallbackReason?: PilotFallbackReason
}

export type PilotKnowledgeObserver = (event: PilotKnowledgeEvent) => void

interface PilotDecision {
  remoteAvailable: boolean
  latencyMs: number
  slug: string
  version?: number
  source: PilotKnowledgeEvent["source"]
  fallbackReason?: PilotFallbackReason
}

function defaultObserver(event: PilotKnowledgeEvent): void {
  // Contrato fechado: nunca inclui pergunta, conteúdo, resposta, sessão ou PII.
  console.info("[SofiaKnowledgePilot]", event)
}

export class PilotKnowledgeRepository implements KnowledgeRepository {
  private decisions = new Map<string, PilotDecision>()
  private readonly local: KnowledgeRepository
  private readonly remote: KnowledgeRepository
  private readonly observer: PilotKnowledgeObserver
  private readonly timeoutMs: number

  constructor(
    local: KnowledgeRepository,
    remote: KnowledgeRepository,
    observer: PilotKnowledgeObserver = defaultObserver,
    timeoutMs = REMOTE_TIMEOUT_MS,
  ) {
    this.local = local
    this.remote = remote
    this.observer = observer
    this.timeoutMs = timeoutMs
  }

  async getAll(): Promise<KnowledgeDocument[]> {
    const localDocuments = await this.local.getAll()
    const startedAt = Date.now()
    this.decisions = new Map()

    let remoteDocuments: KnowledgeDocument[]
    try {
      remoteDocuments = await this.readRemoteWithTimeout()
    } catch (error: unknown) {
      const reason = classifyRemoteError(error)
      const latencyMs = Date.now() - startedAt
      for (const local of localDocuments) {
        const slug = LOCAL_ID_TO_REMOTE_SLUG[local.id]
        if (slug && SHADOW_PILOT_SLUGS.has(slug)) {
          this.decisions.set(local.id, { remoteAvailable: false, latencyMs, slug, source: "LOCAL_FALLBACK", fallbackReason: reason })
        }
      }
      return localDocuments
    }

    const latencyMs = Date.now() - startedAt
    return localDocuments.map((local) => {
      const slug = LOCAL_ID_TO_REMOTE_SLUG[local.id]
      if (!slug || !SHADOW_PILOT_SLUGS.has(slug) || local.visibility !== "public") return local

      const remote = remoteDocuments.find((item) => item.id === slug && item.visibility === "public" && item.ativo)
      if (!remote) {
        this.decisions.set(local.id, { remoteAvailable: true, latencyMs, slug, source: "LOCAL_FALLBACK", fallbackReason: "remote_slug_missing" })
        return local
      }

      this.decisions.set(local.id, { remoteAvailable: true, latencyMs, slug, version: remote.versao, source: "REMOTE_PILOT" })
      // Preserva identidade e metadados de busca locais; somente o conhecimento
      // candidata-visível aprovado (título/conteúdo/categoria/versão) vem do remoto.
      return { ...local, titulo: remote.titulo, categoria: remote.categoria, conteudo: remote.conteudo, versao: remote.versao }
    })
  }

  async getById(id: string): Promise<KnowledgeDocument | null> {
    return (await this.getAll()).find((doc) => doc.id === id) ?? null
  }

  observeQuestion(_question: string, selectedResults: KnowledgeDocument[]): void {
    for (const selected of selectedResults) {
      const decision = this.decisions.get(selected.id)
      if (decision) this.observer({ mode: "PILOT", ...decision })
    }
  }

  private async readRemoteWithTimeout(): Promise<KnowledgeDocument[]> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        this.remote.getAll(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("remote_timeout")), this.timeoutMs)
        }),
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
}

function classifyRemoteError(error: unknown): Exclude<PilotFallbackReason, "remote_slug_missing"> {
  if (error instanceof Error && error.message === "remote_timeout") return "remote_timeout"
  if (error instanceof Error && error.message.startsWith("remote_") &&
    (error.message.includes("payload") || error.message.includes("item_"))) return "remote_invalid_payload"
  return "remote_unavailable"
}
