// Helper compartilhado para gerar, via Anthropic (Claude), um resumo e uma
// explicação de perfil comercial mais ricos que os textos determinísticos
// padrão.
//
// Usado em `finalize-candidate` apenas para enriquecer a *narrativa* que a
// equipe lê no Admin — a decisão de negócio (status aprovada/em_analise/
// reprovada e o rótulo de perfil_comercial alto/medio/baixo) continua sendo
// calculada pelo motor de regras (IPR), nunca pela IA. O prompt recebe o
// rótulo já decidido e só pede uma explicação consistente com ele.
//
// A saída estruturada é obtida forçando o uso de uma "tool" (não existe
// response_format/json_schema na Messages API da Anthropic).
//
// Lança em caso de falha de rede/API/timeout — o chamador deve capturar e
// cair no texto determinístico (best-effort, nunca deve derrubar o fluxo
// principal do lead).

export interface AiAnalysisInput {
  apiKey: string
  nome: string
  cidade?: string
  idade?: number
  profissao?: string
  empresaAtual?: string
  experienciaVendas?: boolean
  whatsapp?: boolean
  possuiInstagram: boolean
  tempoDisponivel?: string
  objetivo?: string
  perfilComercial: "alto" | "medio" | "baixo"
  ipr: number
}

export interface AiAnalysisResult {
  resumo: string
  perfilMotivo: string
}

export const CLAUDE_MODEL = "claude-haiku-4-5-20251001"
const REQUEST_TIMEOUT_MS = 8000
const ANTHROPIC_VERSION = "2023-06-01"

const ANALYSIS_TOOL = {
  name: "registrar_analise",
  description: "Registra o resumo da candidata e a explicação do perfil comercial.",
  input_schema: {
    type: "object",
    properties: {
      resumo: {
        type: "string",
        description:
          "Resumo em português (pt-BR), 2 a 4 frases, natural e específico, para o dono do negócio ler rapidamente sobre a candidata.",
      },
      perfil_motivo: {
        type: "string",
        description:
          "1 a 2 frases explicando por que a candidata recebeu o perfil comercial já decidido, citando os fatores concretos (sem contradizer ou sugerir mudar o rótulo).",
      },
    },
    required: ["resumo", "perfil_motivo"],
  },
} as const

function buildUserPrompt(input: AiAnalysisInput): string {
  const linhas = [
    `Nome: ${input.nome}`,
    input.cidade ? `Cidade: ${input.cidade}` : null,
    input.idade ? `Idade: ${input.idade}` : null,
    `Profissão atual: ${input.profissao ?? "não informado"}`,
    input.empresaAtual ? `Empresa atual: ${input.empresaAtual}` : null,
    `Já trabalhou com vendas: ${input.experienciaVendas ? "sim" : "não"}`,
    `Tem WhatsApp no telefone informado: ${input.whatsapp ? "sim" : "não"}`,
    `Tem Instagram: ${input.possuiInstagram ? "sim" : "não"}`,
    input.tempoDisponivel ? `Tempo disponível por dia: ${input.tempoDisponivel}` : null,
    input.objetivo ? `Motivação relatada pela candidata (texto livre): "${input.objetivo}"` : null,
    `Perfil comercial já decidido pelo sistema de regras: ${input.perfilComercial} (score IPR: ${input.ipr})`,
  ]
  return linhas.filter(Boolean).join("\n")
}

export async function generateAiAnalysis(input: AiAnalysisInput): Promise<AiAnalysisResult> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": input.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 512,
      system:
        "Você ajuda a dona de um negócio de revenda de semijoias (Tania Joias) a avaliar candidatas a revendedora, " +
        "a partir das respostas de um formulário de triagem. Escreva em português do Brasil, tom caloroso e direto. " +
        "Use apenas os fatos fornecidos — nunca invente informação. O perfil comercial (alto/medio/baixo) já foi " +
        "decidido por um motor de regras e não deve ser contestado nem alterado, apenas explicado. Sempre use a " +
        "ferramenta `registrar_analise` para responder.",
      messages: [{ role: "user", content: buildUserPrompt(input) }],
      tools: [ANALYSIS_TOOL],
      tool_choice: { type: "tool", name: ANALYSIS_TOOL.name },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`anthropic_api_error: ${response.status} ${detail}`)
  }

  const data = await response.json()
  const toolUse = (data?.content as Array<Record<string, unknown>> | undefined)?.find(
    (block) => block.type === "tool_use" && block.name === ANALYSIS_TOOL.name,
  )
  const toolInput = toolUse?.input as { resumo?: unknown; perfil_motivo?: unknown } | undefined

  if (typeof toolInput?.resumo !== "string" || typeof toolInput?.perfil_motivo !== "string") {
    throw new Error("anthropic_api_error: resposta fora do formato esperado")
  }

  return { resumo: toolInput.resumo, perfilMotivo: toolInput.perfil_motivo }
}
