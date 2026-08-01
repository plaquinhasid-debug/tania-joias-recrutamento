/**
 * WorkingMemory (RFC-002 / RFC-003, ex-`Memory`).
 *
 * Armazena só os eventos da conversa ATUAL, em memória do processo do
 * browser — não persiste em nenhum lugar (nem `sessionStorage`, nem banco) e
 * não sobrevive a um refresh.
 *
 * A arquitetura está preparada para outros tipos de memória (ver
 * `MemoryTypes.ts`), mas nesta fase só `WorkingMemory` tem implementação
 * real — os demais existem apenas como interfaces.
 */
import type { ConversationEvent } from "./types"

export interface MemoryEntry {
  timestamp: string
  event: ConversationEvent
}

export class WorkingMemory {
  private entries: MemoryEntry[] = []

  record(event: ConversationEvent): MemoryEntry {
    const entry: MemoryEntry = { timestamp: new Date().toISOString(), event }
    this.entries.push(entry)
    return entry
  }

  all(): readonly MemoryEntry[] {
    return this.entries
  }

  last(): MemoryEntry | null {
    return this.entries.at(-1) ?? null
  }

  /** Última entrada de um tipo específico de evento (ex.: última mensagem do bot). */
  lastOfType<T extends ConversationEvent["type"]>(type: T): MemoryEntry | null {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.entries[i].event.type === type) return this.entries[i]
    }
    return null
  }

  clear(): void {
    this.entries = []
  }
}
