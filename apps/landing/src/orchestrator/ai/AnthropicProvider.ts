/**
 * AnthropicProvider (RFC-004).
 *
 * Implementação de `AIProvider` para a Anthropic (Claude).
 *
 * IMPORTANTE — decisão de segurança desta RFC: este código roda no browser
 * (`apps/landing`). A chave da Anthropic (`ANTHROPIC_API_KEY`) só existe
 * como secret dentro das Edge Functions (`finalize-candidate`,
 * `sofia-reagir`) e NUNCA pode ser exposta no navegador. Como esta RFC
 * proíbe criar/alterar Edge Functions, este provider ainda não faz nenhuma
 * chamada de rede real — `generate()` lança um erro claro em vez disso.
 *
 * Quando uma fase futura precisar ativar isto de verdade, o caminho correto
 * é `generate()` chamar uma Edge Function proxy nova (padrão já usado por
 * `fetchSofiaReacao` em `lib/api.ts`) — nunca `fetch` direto pra
 * `api.anthropic.com` com a chave no cliente.
 */
import type { AIProvider, AIRequest, AIResponse } from "./AIProvider"

export const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001"

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic"

  async generate(_request: AIRequest): Promise<AIResponse> {
    throw new Error(
      "[AnthropicProvider] ainda não implementado nesta fase — chamadas reais exigem uma Edge Function " +
        "proxy (a chave da Anthropic nunca pode ficar no browser). Fora do escopo da RFC-004.",
    )
  }
}
