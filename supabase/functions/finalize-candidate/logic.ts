// Lógica pura (sem I/O) de `finalize-candidate` — motor determinístico do
// IPR e dos gates de elegibilidade. Extraído de `index.ts` (RFC-INTELLIGENCE-006)
// só para permitir testar essas funções puras via `finalize-candidate.examples.ts`
// sem importar `index.ts` inteiro (que chama `Deno.serve` no escopo do módulo —
// importar isso subiria um servidor HTTP como efeito colateral do teste).
// `index.ts` continua sendo o único ponto de I/O (Supabase, Anthropic, Meta,
// WhatsApp) — nenhum comportamento externo muda com esta extração.

// Profissões que costumam indicar bom encaixe como revendedora (círculo
// social/atendimento ao público). Sinal positivo para a IA considerar, nunca
// um filtro obrigatório — a Sofia deve reconhecer profissões semelhantes.
export const PROFISSOES_PREFERIDAS = ["Cabeleireira", "Professora", "Enfermeira", "Bancária"]

// RFC-INTELLIGENCE-006 — verdade publicada: 18 anos completos. Idade é gate
// de elegibilidade, nunca pontuação (não existe em `IprPesos`/`settings.ipr_pesos`).
export const IDADE_MINIMA = 18

export type Payload = {
  session_id: string
  nome: string
  telefone: string
  cidade?: string
  idade?: number
  trabalha: boolean
  empresa_atual?: string
  profissao?: string
  estabilidade_profissional?: string
  experiencia_vendas?: boolean
  instagram?: string | null
  whatsapp?: boolean
  tempo_disponivel?: string
  objetivo?: string
  origem?: string
  campanha?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
  fbp?: string
  fbc?: string
  fbclid?: string
}

export type IprPesos = {
  trabalha: number
  experiencia_vendas: number
  whatsapp: number
  instagram: number
  cidade_atendida: number
}

export type IprThresholds = { aprovar: number; analise_min: number }

export type CidadesAtendidas = { restringir: boolean; lista: string[] }

export type SofiaIaAtiva = { ativa: boolean }

export type WhatsappAprovacaoAutomaticaAtiva = { ativa: boolean }
export type WhatsappFichaAutomaticaAtiva = { ativa: boolean }

export function isCidadeAtendida(cidade: string | undefined, config: CidadesAtendidas): boolean {
  if (!config.restringir) return true
  if (!cidade) return false
  const alvo = cidade.trim().toLowerCase()
  return config.lista.some((c) => c.trim().toLowerCase() === alvo)
}

/**
 * RFC-INTELLIGENCE-006 — gate de idade. Nunca participa da soma de pontos do
 * IPR, só decide elegibilidade (mesmo espírito de `trabalha`). Idade
 * ausente/nula ou não-inteira é tratada como NÃO elegível — fail-closed:
 * sem confirmação de idade, nunca assume que a candidata tem 18+.
 */
export function isIdadeElegivel(idade: number | undefined): boolean {
  if (idade === undefined || idade === null) return false
  if (!Number.isInteger(idade)) return false
  return idade >= IDADE_MINIMA
}

/**
 * RFC-INTELLIGENCE-006 — elegibilidade combinada (Abordagem A da RFC-006):
 * `trabalha`, idade e WhatsApp são gates fora da soma de pontos do IPR.
 * `elegivel=false` reprova incondicionalmente, independente do IPR.
 * Ordem de checagem (trabalha -> idade -> whatsapp) só importa para
 * `gerarResumo` decidir qual motivo relatar primeiro quando mais de um gate
 * falha ao mesmo tempo — não afeta o resultado de `elegivel` em si.
 */
export function calcularElegibilidade(payload: Payload): {
  elegivel: boolean
  idadeElegivel: boolean
} {
  const idadeElegivel = isIdadeElegivel(payload.idade)
  const elegivel = payload.trabalha === true && idadeElegivel && payload.whatsapp === true
  return { elegivel, idadeElegivel }
}

export function calcularIpr(payload: Payload, pesos: IprPesos, cidadeAtendida: boolean, elegivel: boolean) {
  if (!elegivel) {
    const zerado = { trabalha: 0, experiencia_vendas: 0, whatsapp: 0, instagram: 0, cidade_atendida: 0 }
    return { total: 0, breakdown: zerado }
  }
  const breakdown = {
    trabalha: pesos.trabalha,
    experiencia_vendas: payload.experiencia_vendas ? pesos.experiencia_vendas : 0,
    whatsapp: payload.whatsapp ? pesos.whatsapp : 0,
    instagram: payload.instagram ? pesos.instagram : 0,
    cidade_atendida: cidadeAtendida ? pesos.cidade_atendida : 0,
  }
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0)
  return { total, breakdown }
}

export function decidirStatus(elegivel: boolean, ipr: number, thresholds: IprThresholds) {
  if (!elegivel) return "reprovada" as const
  if (ipr >= thresholds.aprovar) return "aprovada" as const
  if (ipr >= thresholds.analise_min) return "em_analise" as const
  return "reprovada" as const
}

export function classificarPerfil(elegivel: boolean, ipr: number, thresholds: IprThresholds) {
  if (!elegivel) return { perfil: null as null, motivo: "" }
  if (ipr >= thresholds.aprovar) {
    return {
      perfil: "alto" as const,
      motivo:
        "Reúne trabalho atual, experiência comercial e os canais de contato ideais (WhatsApp/Instagram) para revender com autonomia.",
    }
  }
  if (ipr >= thresholds.analise_min) {
    return {
      perfil: "medio" as const,
      motivo:
        "Já trabalha e mostra bom potencial comercial, mas falta algum diferencial (experiência em vendas, Instagram ou atendimento na cidade).",
    }
  }
  return {
    perfil: "baixo" as const,
    motivo:
      "Está trabalhando, porém ainda não reúne os diferenciais comerciais (experiência em vendas, Instagram, cidade atendida) que indicam alto potencial imediato.",
  }
}

// QUALIFICACAO-002, Parte 1 — normaliza o texto bruto do chip escolhido pra
// uma das 3 categorias controladas. Match exato (após trim), incluindo o
// fallback de texto livre do ChipsAnswerInput: se a candidata digitar algo
// que não bate com nenhuma das 3 opções, ou o campo não vier, o resultado é
// `null` — não inventamos classificação, nem aqui nem em leads antigos.
// PROIBIDO participar de calcularIpr/decidirStatus/classificarPerfil (ver
// QUALIFICACAO-002-estabilidade-trabalho.md).
export type EstabilidadeProfissional = "ALTA" | "MEDIA" | "BAIXA"

export function mapEstabilidadeProfissional(raw: string | undefined): EstabilidadeProfissional | null {
  switch (raw?.trim()) {
    case "Fixa — mesma empresa/local, mesma escala":
      return "ALTA"
    case "Variável, mas recorrente":
      return "MEDIA"
    case "Esporádica, sem muita regularidade":
      return "BAIXA"
    default:
      return null
  }
}

export function gerarResumo(
  payload: Payload,
  idadeElegivel: boolean,
  perfil: "baixo" | "medio" | "alto" | null,
) {
  const primeiroNome = payload.nome.split(" ")[0]
  if (!payload.trabalha) {
    return `${primeiroNome} respondeu que não está trabalhando atualmente. Cadastro salvo para futuras oportunidades da Tania Joias.`
  }
  if (!idadeElegivel) {
    return `${primeiroNome} informou ${payload.idade ?? "idade não informada"} — abaixo da idade mínima de ${IDADE_MINIMA} anos. Cadastro salvo para futuras oportunidades.`
  }
  if (!payload.whatsapp) {
    return `${primeiroNome} trabalha, mas informou não ter WhatsApp no telefone cadastrado — canal de contato obrigatório não confirmado. Cadastro salvo para futuras oportunidades.`
  }
  const partes: string[] = [`${primeiroNome} trabalha como ${payload.profissao || "profissional"}.`]
  if (payload.experiencia_vendas) {
    partes.push("Possui experiência com vendas.")
  }
  partes.push("Busca renda extra revendendo semijoias.")
  if (payload.objetivo) {
    partes.push(`Motivação relatada: "${payload.objetivo}".`)
  }
  if (perfil) {
    partes.push(`Possui perfil comercial ${perfil}.`)
  }
  return partes.join(" ")
}
