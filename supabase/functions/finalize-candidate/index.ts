// Edge Function: finalize-candidate
//
// Único ponto de escrita da tabela `leads` a partir da Landing Page.
// Roda com a service role key (RLS não se aplica aqui), então é o lugar certo
// para aplicar as regras de negócio de forma que o cliente nunca possa
// fabricar um IPR ou status. É também o ponto de extensão preparado para uma
// futura integração real com a OpenAI: hoje `gerarResumo`/`classificarPerfil`
// são determinísticos; no futuro passam a chamar a OpenAI mantendo o mesmo
// contrato de entrada/saída.
import { createClient } from "npm:@supabase/supabase-js@2"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

type Payload = {
  session_id: string
  nome: string
  telefone: string
  cidade?: string
  idade?: number
  trabalha: boolean
  empresa_atual?: string
  profissao?: string
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
}

type IprPesos = {
  trabalha: number
  experiencia_vendas: number
  whatsapp: number
  instagram: number
  cidade_atendida: number
}

type IprThresholds = { aprovar: number; analise_min: number }

type CidadesAtendidas = { restringir: boolean; lista: string[] }

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  })
}

function isCidadeAtendida(cidade: string | undefined, config: CidadesAtendidas): boolean {
  if (!config.restringir) return true
  if (!cidade) return false
  const alvo = cidade.trim().toLowerCase()
  return config.lista.some((c) => c.trim().toLowerCase() === alvo)
}

function calcularIpr(payload: Payload, pesos: IprPesos, cidadeAtendida: boolean) {
  if (!payload.trabalha) {
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

function decidirStatus(trabalha: boolean, ipr: number, thresholds: IprThresholds) {
  if (!trabalha) return "reprovada" as const
  if (ipr >= thresholds.aprovar) return "aprovada" as const
  if (ipr >= thresholds.analise_min) return "em_analise" as const
  return "reprovada" as const
}

function classificarPerfil(trabalha: boolean, ipr: number, thresholds: IprThresholds) {
  if (!trabalha) return { perfil: null as null, motivo: "" }
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
        "Já trabalha e mostra bom potencial comercial, mas falta algum diferencial (experiência em vendas, WhatsApp, Instagram ou atendimento na cidade).",
    }
  }
  return {
    perfil: "baixo" as const,
    motivo:
      "Está trabalhando, porém ainda não reúne os diferenciais comerciais (experiência em vendas, WhatsApp, Instagram, cidade atendida) que indicam alto potencial imediato.",
  }
}

function gerarResumo(payload: Payload, perfil: "baixo" | "medio" | "alto" | null) {
  const primeiroNome = payload.nome.split(" ")[0]
  if (!payload.trabalha) {
    return `${primeiroNome} respondeu que não está trabalhando atualmente. Cadastro salvo para futuras oportunidades da Tania Joias.`
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS })
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405)
  }

  let payload: Payload
  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400)
  }

  if (!payload?.session_id || !payload?.nome || !payload?.telefone) {
    return jsonResponse({ error: "missing_required_fields" }, 400)
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  const { data: settingsRows, error: settingsError } = await supabase
    .from("settings")
    .select("chave, valor")
    .in("chave", ["ipr_pesos", "ipr_thresholds", "cidades_atendidas"])

  if (settingsError) {
    return jsonResponse({ error: "settings_fetch_failed", detail: settingsError.message }, 500)
  }

  const settingsMap = Object.fromEntries((settingsRows ?? []).map((s) => [s.chave, s.valor]))
  const pesos = settingsMap.ipr_pesos as IprPesos
  const thresholds = settingsMap.ipr_thresholds as IprThresholds
  const cidadesConfig = settingsMap.cidades_atendidas as CidadesAtendidas

  const cidadeAtendida = isCidadeAtendida(payload.cidade, cidadesConfig)
  const { total: ipr, breakdown } = calcularIpr(payload, pesos, cidadeAtendida)
  const status = decidirStatus(payload.trabalha, ipr, thresholds)
  const { perfil, motivo } = classificarPerfil(payload.trabalha, ipr, thresholds)
  const resumo = gerarResumo(payload, perfil)
  const recomendacao =
    status === "aprovada" ? "aprovar" : status === "reprovada" ? "reprovar" : "analise_manual"

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .insert({
      nome: payload.nome,
      telefone: payload.telefone,
      cidade: payload.cidade ?? null,
      idade: payload.idade ?? null,
      trabalha: payload.trabalha,
      empresa_atual: payload.empresa_atual ?? null,
      profissao: payload.profissao ?? null,
      experiencia_vendas: payload.experiencia_vendas ?? null,
      instagram: payload.instagram ?? null,
      whatsapp: payload.whatsapp ?? null,
      tempo_disponivel: payload.tempo_disponivel ?? null,
      objetivo: payload.objetivo ?? null,
      ipr,
      perfil_comercial: perfil,
      resumo_ia: resumo,
      status,
      origem: payload.origem ?? "organico",
      campanha: payload.campanha ?? null,
      utm_source: payload.utm_source ?? null,
      utm_medium: payload.utm_medium ?? null,
      utm_campaign: payload.utm_campaign ?? null,
      utm_content: payload.utm_content ?? null,
    })
    .select("id")
    .single()

  if (leadError || !lead) {
    return jsonResponse({ error: "lead_insert_failed", detail: leadError?.message }, 500)
  }

  await supabase.from("ai_analysis").insert({
    lead_id: lead.id,
    resumo,
    perfil_comercial: perfil,
    perfil_motivo: motivo,
    ipr_score: ipr,
    ipr_breakdown: breakdown,
    recomendacao,
    model: "rules-engine-v1",
  })

  await supabase
    .from("conversations")
    .update({ status: "concluida", completed_at: new Date().toISOString(), lead_id: lead.id })
    .eq("session_id", payload.session_id)

  await supabase.from("answers").update({ lead_id: lead.id }).eq("session_id", payload.session_id)

  const eventos = [
    payload.trabalha ? "respondeu_trabalha_sim" : "respondeu_trabalha_nao",
    status === "aprovada" ? "aprovada" : status === "em_analise" ? "analise_manual" : "reprovada",
  ] as const

  await supabase.from("logs").insert(
    eventos.map((tipo_evento) => ({
      tipo_evento,
      lead_id: lead.id,
      session_id: payload.session_id,
      campanha: payload.campanha ?? null,
      origem: payload.origem ?? null,
    })),
  )

  return jsonResponse({
    lead_id: lead.id,
    status,
    ipr,
    perfil_comercial: perfil,
    resumo_ia: resumo,
  })
})
