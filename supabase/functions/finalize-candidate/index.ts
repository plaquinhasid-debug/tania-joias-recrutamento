// Edge Function: finalize-candidate
//
// Único ponto de escrita da tabela `leads` a partir da Landing Page.
// Roda com a service role key (RLS não se aplica aqui), então é o lugar certo
// para aplicar as regras de negócio de forma que o cliente nunca possa
// fabricar um IPR ou status.
//
// `decidirStatus`/`classificarPerfil` continuam 100% determinísticos (motor
// de regras baseado no IPR) — isso decide aprovação/reprovação e nunca deve
// depender de uma chamada externa. A Anthropic/Claude (ver `_shared/ai-analysis.ts`)
// entra só depois, como enriquecimento best-effort do texto (`resumo`/
// `perfil_motivo`); se falhar ou a chave não estiver configurada, cai no
// texto determinístico de `gerarResumo`/`classificarPerfil` sem afetar nada.
import { createClient } from "npm:@supabase/supabase-js@2"

import { sendMetaLeadEvent } from "../_shared/meta-conversions.ts"
import { sendWhatsappApprovalTemplate, sendWhatsappFichaTemplate } from "../_shared/whatsapp-cloud-api.ts"
import { CLAUDE_MODEL, generateAiAnalysis } from "../_shared/ai-analysis.ts"

// Profissões que costumam indicar bom encaixe como revendedora (círculo
// social/atendimento ao público). Sinal positivo para a IA considerar, nunca
// um filtro obrigatório — a Sofia deve reconhecer profissões semelhantes.
const PROFISSOES_PREFERIDAS = ["Cabeleireira", "Professora", "Enfermeira", "Bancária"]

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

type IprPesos = {
  trabalha: number
  experiencia_vendas: number
  whatsapp: number
  instagram: number
  cidade_atendida: number
}

type IprThresholds = { aprovar: number; analise_min: number }

type CidadesAtendidas = { restringir: boolean; lista: string[] }

type SofiaIaAtiva = { ativa: boolean }

type WhatsappAprovacaoAutomaticaAtiva = { ativa: boolean }
type WhatsappFichaAutomaticaAtiva = { ativa: boolean }

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

// QUALIFICACAO-002, Parte 1 — normaliza o texto bruto do chip escolhido pra
// uma das 3 categorias controladas. Match exato (após trim), incluindo o
// fallback de texto livre do ChipsAnswerInput: se a candidata digitar algo
// que não bate com nenhuma das 3 opções, ou o campo não vier, o resultado é
// `null` — não inventamos classificação, nem aqui nem em leads antigos.
// PROIBIDO participar de calcularIpr/decidirStatus/classificarPerfil (ver
// QUALIFICACAO-002-estabilidade-trabalho.md).
type EstabilidadeProfissional = "ALTA" | "MEDIA" | "BAIXA"

function mapEstabilidadeProfissional(raw: string | undefined): EstabilidadeProfissional | null {
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

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
  const userAgent = req.headers.get("user-agent")

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  const { data: settingsRows, error: settingsError } = await supabase
    .from("settings")
    .select("chave, valor")
    .in("chave", [
      "ipr_pesos",
      "ipr_thresholds",
      "cidades_atendidas",
      "sofia_ia_ativa",
      "whatsapp_aprovacao_automatica_ativa",
      "whatsapp_ficha_automatica_ativa",
    ])

  if (settingsError) {
    return jsonResponse({ error: "settings_fetch_failed", detail: settingsError.message }, 500)
  }

  const settingsMap = Object.fromEntries((settingsRows ?? []).map((s) => [s.chave, s.valor]))
  const pesos = settingsMap.ipr_pesos as IprPesos
  const thresholds = settingsMap.ipr_thresholds as IprThresholds
  const cidadesConfig = settingsMap.cidades_atendidas as CidadesAtendidas
  const sofiaIaAtiva = Boolean((settingsMap.sofia_ia_ativa as SofiaIaAtiva | undefined)?.ativa)
  const whatsappAprovacaoAutomaticaAtiva = Boolean(
    (settingsMap.whatsapp_aprovacao_automatica_ativa as WhatsappAprovacaoAutomaticaAtiva | undefined)
      ?.ativa,
  )
  const whatsappFichaAutomaticaAtiva = Boolean(
    (settingsMap.whatsapp_ficha_automatica_ativa as WhatsappFichaAutomaticaAtiva | undefined)?.ativa,
  )

  const cidadeAtendida = isCidadeAtendida(payload.cidade, cidadesConfig)
  const { total: ipr, breakdown } = calcularIpr(payload, pesos, cidadeAtendida)
  const status = decidirStatus(payload.trabalha, ipr, thresholds)
  const { perfil, motivo } = classificarPerfil(payload.trabalha, ipr, thresholds)
  const recomendacao =
    status === "aprovada" ? "aprovar" : status === "reprovada" ? "reprovar" : "analise_manual"

  // Fallback determinístico (sempre calculado). Se a candidata trabalha, a
  // flag `sofia_ia_ativa` está ligada e a chave da Anthropic está
  // configurada, tentamos substituir por uma análise real — o rótulo de
  // perfil (`perfil`) e o `status` nunca mudam com isso, só o texto
  // explicativo e os campos consultivos abaixo ficam mais ricos.
  let resumo = gerarResumo(payload, perfil)
  let motivoFinal = motivo
  let analiseModel = "rules-engine-v1"
  let analiseExpandida: Awaited<ReturnType<typeof generateAiAnalysis>> | null = null

  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY")
  if (payload.trabalha && perfil && sofiaIaAtiva && anthropicApiKey) {
    try {
      const ai = await generateAiAnalysis({
        apiKey: anthropicApiKey,
        nome: payload.nome,
        cidade: payload.cidade,
        idade: payload.idade,
        profissao: payload.profissao,
        empresaAtual: payload.empresa_atual,
        experienciaVendas: payload.experiencia_vendas,
        whatsapp: payload.whatsapp,
        possuiInstagram: Boolean(payload.instagram),
        tempoDisponivel: payload.tempo_disponivel,
        objetivo: payload.objetivo,
        perfilComercial: perfil,
        ipr,
        qualificacao: {
          cidadesAtendidas: cidadesConfig.restringir ? cidadesConfig.lista : [],
          profissoesPreferidas: PROFISSOES_PREFERIDAS,
        },
      })
      resumo = ai.resumo
      motivoFinal = ai.perfilMotivo
      analiseModel = CLAUDE_MODEL
      analiseExpandida = ai
    } catch (err) {
      console.error("[finalize-candidate] falha na análise IA, usando fallback determinístico", err)
    }
  }

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
      // QUALIFICACAO-002, Parte 1 — só persistência estruturada. Nunca
      // entra em `calcularIpr`/`decidirStatus`/`classificarPerfil` acima
      // (calculados antes desta linha, sem nenhuma referência a este campo).
      estabilidade_profissional: mapEstabilidadeProfissional(payload.estabilidade_profissional),
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
      fbp: payload.fbp ?? null,
      fbc: payload.fbc ?? null,
      fbclid: payload.fbclid ?? null,
      client_ip: clientIp,
      client_user_agent: userAgent,
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
    perfil_motivo: motivoFinal,
    ipr_score: ipr,
    ipr_breakdown: breakdown,
    recomendacao,
    model: analiseModel,
    resumo_executivo: analiseExpandida?.resumoExecutivo ?? null,
    resumo_comercial: analiseExpandida?.resumoComercial ?? null,
    resumo_comportamental: analiseExpandida?.resumoComportamental ?? null,
    resumo_motivacional: analiseExpandida?.resumoMotivacional ?? null,
    icp_score: analiseExpandida?.icpScore ?? null,
    perfil_sugerido_ia: analiseExpandida?.perfilSugeridoIa ?? null,
    potencial_empreendedor: analiseExpandida?.potencialEmpreendedor ?? null,
    probabilidade_sucesso: analiseExpandida?.probabilidadeSucesso ?? null,
    grau_confianca_ia: analiseExpandida?.grauConfiancaIa ?? null,
    grau_confianca_explicacao: analiseExpandida?.grauConfiancaExplicacao ?? null,
    proxima_acao: analiseExpandida?.proximaAcao ?? null,
    sentimento: analiseExpandida?.sentimento ?? null,
    motivacao_principal: analiseExpandida?.motivacaoPrincipal ?? null,
    pontos_fortes: analiseExpandida?.pontosFortes ?? null,
    pontos_atencao: analiseExpandida?.pontosAtencao ?? null,
  })

  await supabase
    .from("conversations")
    .update({ status: "concluida", completed_at: new Date().toISOString(), lead_id: lead.id })
    .eq("session_id", payload.session_id)

  // `is("lead_id", null)` evita "roubar" respostas de um lead anterior caso o
  // mesmo session_id (persistido em sessionStorage) seja reaproveitado por uma
  // conversa completamente nova na mesma aba do navegador.
  await supabase
    .from("answers")
    .update({ lead_id: lead.id })
    .eq("session_id", payload.session_id)
    .is("lead_id", null)

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

  if (status === "aprovada") {
    // Gera o link da Ficha de Aprovação sozinho, mesmo quando a própria IPR
    // já aprova a candidata na hora (sem passar pela equipe no Admin) — sem
    // isso, essa lead ficava esperando alguém lembrar de gerar o link
    // manualmente. Best-effort: nunca deve derrubar a resposta principal.
    try {
      const { data: ficha, error: fichaError } = await supabase
        .from("leads_ficha")
        .insert({ lead_id: lead.id })
        .select("token")
        .single()
      if (fichaError) throw fichaError
      await supabase
        .from("leads")
        .update({ etapa_pos_aprovacao: "contatada" })
        .eq("id", lead.id)
        .is("etapa_pos_aprovacao", null)

      if (whatsappFichaAutomaticaAtiva && payload.whatsapp === true) {
        const token = Deno.env.get("WHATSAPP_CLOUD_API_TOKEN")
        const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")
        const templateName = Deno.env.get("WHATSAPP_FICHA_TEMPLATE_NAME")
        if (token && phoneNumberId && templateName) {
          try {
            await sendWhatsappFichaTemplate({
              token,
              phoneNumberId,
              templateName,
              telefone: payload.telefone,
              nome: payload.nome,
              fichaToken: ficha.token,
            })
            await supabase
              .from("leads_ficha")
              .update({ whatsapp_enviado_em: new Date().toISOString() })
              .eq("lead_id", lead.id)
          } catch (err) {
            console.error("[finalize-candidate] falha ao enviar WhatsApp da Ficha", err)
          }
        }
      }
    } catch (err) {
      console.error("[finalize-candidate] falha ao gerar link da Ficha automaticamente", err)
    }

    const pixelId = Deno.env.get("META_PIXEL_ID")
    const accessToken = Deno.env.get("META_CONVERSIONS_API_TOKEN")
    if (pixelId && accessToken) {
      try {
        await sendMetaLeadEvent({
          pixelId,
          accessToken,
          leadId: lead.id,
          telefone: payload.telefone,
          fbp: payload.fbp,
          fbc: payload.fbc,
          clientIp,
          userAgent,
        })
        await supabase
          .from("leads")
          .update({ meta_lead_sent_at: new Date().toISOString() })
          .eq("id", lead.id)
      } catch (err) {
        console.error("[finalize-candidate] falha ao enviar evento Lead ao Meta", err)
      }
    }

    if (whatsappAprovacaoAutomaticaAtiva && payload.whatsapp === true) {
      const token = Deno.env.get("WHATSAPP_CLOUD_API_TOKEN")
      const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")
      const templateName = Deno.env.get("WHATSAPP_APPROVAL_TEMPLATE_NAME")
      if (token && phoneNumberId && templateName) {
        try {
          await sendWhatsappApprovalTemplate({
            token,
            phoneNumberId,
            templateName,
            telefone: payload.telefone,
            nome: payload.nome,
          })
          await supabase
            .from("leads")
            .update({ whatsapp_automatico_enviado_em: new Date().toISOString() })
            .eq("id", lead.id)
        } catch (err) {
          console.error("[finalize-candidate] falha ao enviar WhatsApp de aprovação", err)
        }
      }
    }
  }

  return jsonResponse({
    lead_id: lead.id,
    status,
    ipr,
    perfil_comercial: perfil,
    resumo_ia: resumo,
  })
})
