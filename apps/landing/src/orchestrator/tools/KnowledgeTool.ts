/**
 * KnowledgeTool (RFC-006).
 *
 * Ponte entre o `ToolEngine` e o `KnowledgeEngine`: implementa a interface
 * `Tool` (RFC-004) especializando o `KnowledgeBaseTool` já previsto em
 * `tools/types.ts`. Só traduz `{ consulta }` numa busca textual do Engine —
 * nenhuma lógica de negócio mora aqui.
 *
 * IMPORTANTE (RFC-006): esta Tool ainda NÃO é registrada em nenhum
 * `ToolEngine` real — só existe a classe, pronta para uma RFC futura chamar
 * `toolEngine.register(new KnowledgeTool())` quando o fluxo Intent →
 * Decision → Action → Tool passar a ser usado de verdade.
 */
import { createDefaultKnowledgeEngine, KnowledgeEngine } from "../knowledge/KnowledgeEngine"
import type { KnowledgeDocument } from "../knowledge/types"
import type { ToolResult } from "./Tool"
import type { KnowledgeBaseTool } from "./types"

export class KnowledgeTool implements KnowledgeBaseTool {
  readonly name = "KnowledgeBase" as const
  private readonly engine: KnowledgeEngine

  constructor(engine: KnowledgeEngine = createDefaultKnowledgeEngine()) {
    this.engine = engine
  }

  async execute(input?: { consulta: string }): Promise<ToolResult<KnowledgeDocument[]>> {
    if (!input?.consulta) {
      return { tool: this.name, success: false, data: null }
    }

    const documentos = await this.engine.search({ texto: input.consulta })
    return { tool: this.name, success: true, data: documentos }
  }
}
