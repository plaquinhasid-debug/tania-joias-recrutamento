/**
 * Cenários executáveis de `logic.ts` (RFC-INTELLIGENCE-006, Objetivo "testes
 * primeiro"). Mesmo padrão já usado em `classifyForFeature004.examples.ts`
 * (RFC-007 em diante): sem test runner instalado neste monorepo, casos
 * reais e executáveis com `check(nome, esperado, obtido)`, rodados
 * manualmente (`deno run` ou script equivalente) — não é importado por
 * `index.ts` nem por nenhum caminho de produção.
 *
 * Cobre os cenários A-G + regressão de `trabalha=false` especificados na
 * RFC-INTELLIGENCE-006 (seção 9) e no pedido de implementação (seção 4).
 * Roda contra `logic.ts` puro — nunca importa `index.ts` (que chama
 * `Deno.serve` no escopo do módulo; importar isso subiria um servidor HTTP
 * como efeito colateral de rodar os exemplos).
 */
import {
  calcularElegibilidade,
  calcularIpr,
  classificarPerfil,
  decidirStatus,
  isIdadeElegivel,
  type IprPesos,
  type IprThresholds,
  type Payload,
} from "./logic.ts"

export interface FinalizeCandidateExampleResult {
  name: string
  passou: boolean
  detalhe: string
}

// Mesmos valores reais confirmados em produção (settings.ipr_pesos/ipr_thresholds,
// consultado via Supabase em 2026-08-16) — não os reais em si (isolamento do
// teste), só os mesmos números, pra os cenários baterem com o que a RFC-006
// documentou.
const PESOS: IprPesos = { trabalha: 50, experiencia_vendas: 20, whatsapp: 10, instagram: 10, cidade_atendida: 10 }
const THRESHOLDS: IprThresholds = { aprovar: 80, analise_min: 60 }

function basePayload(overrides: Partial<Payload>): Payload {
  return {
    session_id: "exemplo",
    nome: "Candidata Exemplo",
    telefone: "11999999999",
    trabalha: true,
    ...overrides,
  }
}

export function runFinalizeCandidateLogicExamples(): FinalizeCandidateExampleResult[] {
  const resultados: FinalizeCandidateExampleResult[] = []

  function check(name: string, esperado: unknown, obtido: unknown) {
    const passou = JSON.stringify(esperado) === JSON.stringify(obtido)
    resultados.push({ name, passou, detalhe: `esperado=${JSON.stringify(esperado)} obtido=${JSON.stringify(obtido)}` })
  }

  /** Roda a decisão completa (elegibilidade -> IPR -> status/perfil) igual ao que `index.ts` faz. */
  function decidir(payload: Payload, cidadeAtendida = true) {
    const { elegivel, idadeElegivel } = calcularElegibilidade(payload)
    const { total, breakdown } = calcularIpr(payload, PESOS, cidadeAtendida, elegivel)
    const status = decidirStatus(elegivel, total, THRESHOLDS)
    const { perfil } = classificarPerfil(elegivel, total, THRESHOLDS)
    return { elegivel, idadeElegivel, ipr: total, breakdown, status, perfil }
  }

  // Cenário A — 17 anos + restante perfeito -> reprovada.
  {
    const payload = basePayload({
      idade: 17,
      whatsapp: true,
      experiencia_vendas: true,
      instagram: "@candidata",
    })
    const r = decidir(payload)
    check("A. 17 anos + resto perfeito -> reprovada", "reprovada", r.status)
    check("A. 17 anos -> perfil null", null, r.perfil)
  }

  // Cenário B — 18 anos + requisitos suficientes -> fluxo normal (aprovada).
  {
    const payload = basePayload({
      idade: 18,
      whatsapp: true,
      experiencia_vendas: true,
      instagram: "@candidata",
    })
    const r = decidir(payload)
    check("B. 18 anos + trabalha + experiência + WhatsApp + Instagram -> aprovada", "aprovada", r.status)
  }

  // Cenário C — chamada direta ao servidor com idade 16 (contornando o
  // frontend) -> não elegível. `isIdadeElegivel` roda sempre no servidor,
  // não importa quem/como montou o payload.
  {
    check("C. isIdadeElegivel(16) -> false (payload direto, sem frontend)", false, isIdadeElegivel(16))
    const payload = basePayload({ idade: 16, whatsapp: true, experiencia_vendas: true, instagram: "@x" })
    const r = decidir(payload)
    check("C. idade=16 via payload direto -> reprovada mesmo com resto perfeito", "reprovada", r.status)
  }

  // Cenário D — autônoma, empresa_atual descritivo (não é gate).
  {
    const payload = basePayload({
      idade: 25,
      whatsapp: true,
      profissao: "Autônoma",
      empresa_atual: "Trabalho por conta própria",
    })
    const r = decidir(payload)
    check("D. empresa_atual='Trabalho por conta própria' não bloqueia -> segue elegível", true, r.elegivel)
  }

  // Cenário E — manicure autônoma -> atividade profissional válida.
  {
    const payload = basePayload({
      idade: 30,
      whatsapp: true,
      profissao: "Manicure",
      empresa_atual: "Autônoma",
    })
    const r = decidir(payload)
    check("E. Manicure autônoma -> elegível (profissão nunca é gate)", true, r.elegivel)
  }

  // Cenário F — WhatsApp=false + score que hoje chegaria a >=80 -> reprovada.
  {
    const payload = basePayload({
      idade: 25,
      whatsapp: false,
      experiencia_vendas: true,
      instagram: "@candidata",
    })
    const r = decidir(payload, true)
    check("F. whatsapp=false + experiência+Instagram+cidade (IPR bruto seria 90) -> reprovada", "reprovada", r.status)
    check("F. whatsapp=false -> IPR total zerado", 0, r.ipr)
    check("F. whatsapp=false -> breakdown inteiro zerado", { trabalha: 0, experiencia_vendas: 0, whatsapp: 0, instagram: 0, cidade_atendida: 0 }, r.breakdown)
  }

  // Cenário G — WhatsApp=true + Instagram=false -> continua elegível
  // (Instagram nunca é gate). Precisa de experiência+cidade pra chegar a 80.
  {
    const payload = basePayload({
      idade: 25,
      whatsapp: true,
      experiencia_vendas: true,
      instagram: null,
    })
    const r = decidir(payload, true)
    check("G. whatsapp=true, sem Instagram, experiência+cidade -> aprovada", "aprovada", r.status)
    check("G. sem Instagram -> elegível continua true", true, r.elegivel)
  }

  // Regressão — trabalha=false continua reprovando incondicionalmente,
  // mesmo com idade/WhatsApp perfeitos.
  {
    const payload = basePayload({
      trabalha: false,
      idade: 25,
      whatsapp: true,
      experiencia_vendas: true,
      instagram: "@candidata",
    })
    const r = decidir(payload, true)
    check("Regressão. trabalha=false -> reprovada (inalterado pela RFC-006)", "reprovada", r.status)
    check("Regressão. trabalha=false -> IPR 0", 0, r.ipr)
  }

  // Idade ausente/inválida -> fail-closed (não elegível).
  {
    check("Idade ausente -> não elegível", false, isIdadeElegivel(undefined))
    check("Idade inválida (2.5) -> não elegível", false, isIdadeElegivel(2.5))
    check("Idade negativa -> não elegível", false, isIdadeElegivel(-5))
    check("Idade exatamente 18 -> elegível", true, isIdadeElegivel(18))
  }

  // Inelegível por qualquer motivo -> IPR total 0 e breakdown zerado (não só status).
  {
    const payload = basePayload({
      idade: 15,
      whatsapp: true,
      experiencia_vendas: true,
      instagram: "@candidata",
    })
    const r = decidir(payload, true)
    check("Inelegível (idade) -> IPR total 0", 0, r.ipr)
    check("Inelegível (idade) -> breakdown zerado", { trabalha: 0, experiencia_vendas: 0, whatsapp: 0, instagram: 0, cidade_atendida: 0 }, r.breakdown)
  }

  return resultados
}
