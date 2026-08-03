/**
 * answerCandidateQuestion (FEATURE-003).
 *
 * Liga as 4 peças já existentes e testadas isoladamente — QUESTION →
 * KnowledgeEngine → AIGateway → ResponseComposer — numa função só. Continua
 * "shadow": nada em `useSofiaFlow.ts` chama isto ainda (ver especificação da
 * FEATURE-003, seção "o que não deve fazer" — conectar ao chat real é uma
 * feature futura separada, com autorização própria).
 *
 * Nunca lança — qualquer falha (sem documento, timeout, erro da Anthropic)
 * vira o mesmo fallback seguro do `ResponseComposer`, nunca propaga erro
 * técnico nem travaria quem chamar.
 */
import type { AIGateway } from "../ai/AIGateway"
import { createServerBackedAIGateway } from "../ai/AIGateway"
import { composeResponse } from "../composer/ResponseComposer"
import type { ComposedResponse } from "../composer/types"
import { createLogger } from "../devLog"
import { createDefaultKnowledgeEngine } from "../knowledge/KnowledgeEngine"
import type { KnowledgeDocument } from "../knowledge/types"
import type { IntentType } from "../types"

const log = createLogger("[Pipeline][answerCandidateQuestion]")

export interface AnswerCandidateQuestionInput {
  /** Pergunta da candidata, em linguagem natural. */
  pergunta: string
  /** Correlação/logs do AIGateway real (RFC-011) — obrigatório mesmo em teste isolado, nunca prova de identidade. */
  sessionId: string
  /** Pergunta atual do roteiro, se houver — anexada pelo `ResponseComposer` (mesmo contrato de sempre). */
  currentQuestion?: string
  /** Máximo de documentos buscados no KnowledgeEngine (default: 3, mesmo default de `searchByQuestion`). */
  limiteDocumentos?: number
  /** Passa direto pro `KnowledgeEngine.searchByQuestion` — nunca deve ser `true` fora de um teste deliberado da trava de `visibility`. */
  includeInternal?: boolean
  /** Override do gateway (ex.: um fake que sempre lança, pra testar o Objetivo 6) — sem isso, usa o gateway real (`createServerBackedAIGateway`), nunca o stub que só lança erro. */
  aiGateway?: AIGateway
  intent?: IntentType
}

export interface AnswerCandidateQuestionResult {
  pergunta: string
  documentosEncontrados: KnowledgeDocument[]
  /** `false` quando o KnowledgeEngine não achou nada — a IA nunca chega a ser chamada (Objetivo 4). */
  iaChamada: boolean
  /** Mensagem de erro da IA, se houve falha/timeout (Objetivo 6) — sempre absorvida no fallback do Composer, nunca lançada. */
  erroIA?: string
  composed: ComposedResponse
}

export async function answerCandidateQuestion(
  input: AnswerCandidateQuestionInput,
): Promise<AnswerCandidateQuestionResult> {
  const engine = createDefaultKnowledgeEngine()
  const documentosEncontrados = await engine.searchByQuestion(input.pergunta, input.limiteDocumentos ?? 3, {
    includeInternal: input.includeInternal,
  })

  const intent: IntentType = input.intent ?? "QUESTION"

  // Objetivo 4: sem documento algum, não vale a pena chamar a IA — cai
  // direto no fallback seguro do ResponseComposer (mesmo texto que ele já
  // usa pra QUESTION via `FALLBACK_BODY_BY_KIND`), sem gastar uma chamada
  // de IA. `aiResponse: ""` reprova em `checkHasText`/`EMPTY_TEXT`, então o
  // Composer cai no fallback sozinho — nenhuma lógica de fallback nova aqui.
  if (documentosEncontrados.length === 0) {
    log("Nenhum documento encontrado — pulando a IA, indo direto pro fallback.", { pergunta: input.pergunta })
    return {
      pergunta: input.pergunta,
      documentosEncontrados,
      iaChamada: false,
      composed: composeResponse({ aiResponse: "", currentQuestion: input.currentQuestion, intent }),
    }
  }

  const gateway = input.aiGateway ?? createServerBackedAIGateway(input.sessionId)
  let aiResponseText = ""
  let erroIA: string | undefined

  try {
    const resposta = await gateway.request({
      kind: "response",
      prompt: input.pergunta,
      knowledgeDocuments: documentosEncontrados.map((doc) => ({ titulo: doc.titulo, conteudo: doc.conteudo })),
    })
    aiResponseText = resposta.content
  } catch (err) {
    // Objetivo 6: erro/timeout da IA nunca propaga — vira `aiResponse`
    // vazio, e o mesmo mecanismo do Objetivo 4 acima (EMPTY_TEXT →
    // fallback) cuida do resto.
    erroIA = err instanceof Error ? err.message : String(err)
    log("Falha ao chamar a IA — caindo no fallback do ResponseComposer.", { erro: erroIA })
  }

  return {
    pergunta: input.pergunta,
    documentosEncontrados,
    iaChamada: true,
    erroIA,
    composed: composeResponse({ aiResponse: aiResponseText, currentQuestion: input.currentQuestion, intent }),
  }
}
