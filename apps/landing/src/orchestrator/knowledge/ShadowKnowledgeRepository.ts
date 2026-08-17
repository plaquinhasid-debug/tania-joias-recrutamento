import type { KnowledgeRepository } from "./KnowledgeRepository"
import type { KnowledgeDocument } from "./types"
import { comparePilotKnowledge, LOCAL_ID_TO_REMOTE_SLUG } from "./ShadowKnowledgeCore.ts"
import type { RemoteKnowledgeItem } from "./ShadowKnowledgeCore.ts"

const REMOTE_TIMEOUT_MS = 2_500

export interface ShadowKnowledgeEvent {
  executed: true
  remoteAvailable: boolean
  latencyMs: number
  localSlugs: string[]
  remoteSlugs: string[]
  remoteVersions: Record<string, number>
  agreement: "agreement" | "divergence" | "not_applicable" | "not_compared"
  reason?: ShadowKnowledgeReason
}

export type ShadowKnowledgeReason = "remote_timeout" | "remote_invalid_payload" | "remote_unavailable"

export type ShadowKnowledgeObserver = (event: ShadowKnowledgeEvent) => void

function defaultObserver(event: ShadowKnowledgeEvent): void {
  // Contrato deliberadamente sem pergunta, conteúdo, sessão ou dados da candidata.
  console.info("[SofiaKnowledgeShadow]", event)
}

export class ShadowKnowledgeRepository implements KnowledgeRepository {
  private readonly local: KnowledgeRepository
  private readonly remote: KnowledgeRepository
  private readonly observer: ShadowKnowledgeObserver
  private readonly timeoutMs: number

  constructor(
    local: KnowledgeRepository,
    remote: KnowledgeRepository,
    observer: ShadowKnowledgeObserver = defaultObserver,
    timeoutMs = REMOTE_TIMEOUT_MS,
  ) {
    this.local = local
    this.remote = remote
    this.observer = observer
    this.timeoutMs = timeoutMs
  }

  getAll(): Promise<KnowledgeDocument[]> {
    return this.local.getAll()
  }

  getById(id: string): Promise<KnowledgeDocument | null> {
    return this.local.getById(id)
  }

  observeQuestion(pergunta: string, localResults: KnowledgeDocument[]): void {
    const startedAt = Date.now()
    void this.readRemoteWithTimeout()
      .then(async (remoteDocuments) => {
        // A relevância vem do resultado LOCAL já escolhido pelo engine. O
        // remoto só verifica os mesmos slugs; nunca participa do ranking.
        void pergunta
        const remoteItems: RemoteKnowledgeItem[] = remoteDocuments.map((doc) => ({
          knowledge_id: doc.id,
          slug: doc.id,
          category: doc.categoria,
          title: doc.titulo,
          content: doc.conteudo,
          version: doc.versao,
        }))
        this.observer({
          executed: true,
          remoteAvailable: true,
          latencyMs: Date.now() - startedAt,
          ...comparePilotKnowledge(localResults, remoteItems),
        })
      })
      .catch((error: unknown) => {
        this.observer({
          executed: true,
          remoteAvailable: false,
          latencyMs: Date.now() - startedAt,
          localSlugs: localResults.map((doc) => LOCAL_ID_TO_REMOTE_SLUG[doc.id]).filter(Boolean),
          remoteSlugs: [],
          remoteVersions: {},
          agreement: "not_compared",
          reason: classifyRemoteError(error),
        })
      })
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

function classifyRemoteError(error: unknown): ShadowKnowledgeReason {
  if (error instanceof Error && error.message === "remote_timeout") return "remote_timeout"
  if (error instanceof Error && error.message.startsWith("remote_")) {
    if (error.message.includes("payload") || error.message.includes("item_")) return "remote_invalid_payload"
  }
  return "remote_unavailable"
}
