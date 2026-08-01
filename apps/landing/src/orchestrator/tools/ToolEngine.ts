/**
 * ToolEngine (RFC-004).
 *
 * Registro e executor central de ferramentas de conhecimento. Descobre qual
 * `Tool` usar a partir do nome e a executa — quem chama (`ActionEngine`,
 * no futuro) nunca sabe como a ferramenta busca a informação por dentro.
 *
 * Nesta fase nenhuma Tool real está registrada — o motor existe, mas está
 * vazio (nenhuma consulta a banco/FAQ/settings acontece).
 */
import { createLogger } from "../devLog"
import type { Tool, ToolName, ToolResult } from "./Tool"

const log = createLogger("[ToolEngine]")

export class ToolEngine {
  private readonly tools = new Map<ToolName, Tool>()

  register(tool: Tool): void {
    this.tools.set(tool.name, tool)
  }

  async execute<TData = unknown>(name: ToolName, input?: unknown): Promise<ToolResult<TData>> {
    log("Ferramenta solicitada:", name)

    const tool = this.tools.get(name)
    if (!tool) {
      log("Ferramenta não encontrada:", name)
      return { tool: name, success: false, data: null }
    }
    log("Ferramenta encontrada:", name)

    const start = Date.now()
    try {
      const result = (await tool.execute(input)) as ToolResult<TData>
      log(`Tempo de execução: ${Date.now() - start}ms`)
      log("Resultado:", result)
      return result
    } catch (err) {
      log(`Ferramenta "${name}" falhou após ${Date.now() - start}ms:`, err)
      return { tool: name, success: false, data: null }
    }
  }
}
