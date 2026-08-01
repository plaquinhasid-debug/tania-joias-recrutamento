/**
 * Memória do Orquestrador (RFC-002, fase 1).
 *
 * Armazena só os eventos da conversa ATUAL, em memória do processo do
 * browser — não persiste em nenhum lugar (nem `sessionStorage`, nem banco) e
 * não sobrevive a um refresh. Uma fase futura pode trocar a implementação
 * interna por algo persistente sem mudar o contrato público desta classe.
 */
import type { ConversationEvent } from "./types"

export interface MemoryEntry {
  timestamp: string
  event: ConversationEvent
}

export class Memory {
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
