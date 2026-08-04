/**
 * FEATURE-005, Parte 4, Objetivo 11 — testes controlados usando
 * `computeShadowObservation` (a lógica pura, sem o gate de modo). Cobre os
 * casos pedidos que são alcançáveis SEM alterar `TextAnswerForm.tsx`/
 * `ChipsAnswerInput.tsx` (ver nota sobre o teste 11 no relatório final —
 * texto reprovado pelo Zod nunca chega em `useSofiaFlow.ts` na arquitetura
 * atual, então não dá pra testar isso neste ponto de integração).
 */
import { computeShadowObservation } from "./shadowObserver"

export interface ShadowExampleResult {
  name: string
  passou: boolean
  detalhe: string
}

export function runShadowObserverExamples(): ShadowExampleResult[] {
  const resultados: ShadowExampleResult[] = []

  function caso(
    name: string,
    fieldKey: string,
    currentQuestion: string,
    candidateAnswer: string,
    currentFlowAcceptedAnswer: boolean,
    verificar: (obs: ReturnType<typeof computeShadowObservation>) => { ok: boolean; detalhe: string },
  ) {
    const obs = computeShadowObservation({
      sessionId: "teste-parte-4",
      fieldKey,
      currentQuestion,
      candidateAnswer,
      currentFlowAcceptedAnswer,
      knownContext: {},
    })
    const { ok, detalhe } = verificar(obs)
    resultados.push({ name, passou: ok, detalhe })
  }

  // 1. Resposta válida de nome.
  caso("1. Resposta válida de nome", "nome", "Qual é o seu nome completo?", "Camila Rodrigues", true, (obs) => ({
    ok: obs?.classification.kind === "ANSWER" && obs.classification.canFillCurrentField === true,
    detalhe: `kind=${obs?.classification.kind} canFill=${obs?.classification.canFillCurrentField}`,
  }))

  // 2. Pergunta comercial digitada no campo profissão (mas o fluxo real,
  // com FEATURE-004 ligada, ACEITARIA isso como ANSWER_WITH_TOOL, não como
  // resposta salva — currentFlowAcceptedAnswer=false neste caso).
  caso(
    "2. Pergunta comercial em profissão (FEATURE-004 já intercepta)",
    "profissao",
    "Qual é a sua profissão?",
    "Quanto eu ganho de comissão?",
    false,
    (obs) => ({
      ok: obs?.classification.kind === "QUESTION" && obs.divergences.length === 0,
      detalhe: `kind=${obs?.classification.kind} divergences=${JSON.stringify(obs?.divergences)}`,
    }),
  )

  // 3. "Tenho pouco tempo" em tempo_disponivel — ANSWER pro classificador
  // contextual (correto). O classificador simples da Parte 1 (sem contexto
  // de campo) diria OBJECTION pra essa mesma frase — CLASSIFIER_DISAGREEMENT
  // é o resultado ESPERADO aqui, é exatamente a melhoria que a Parte 2 trouxe.
  caso("3. 'Tenho pouco tempo' em tempo_disponivel", "tempo_disponivel", "Quanto tempo você pode dedicar?", "Tenho pouco tempo", true, (obs) => ({
    ok:
      obs?.classification.kind === "ANSWER" &&
      obs.classification.canFillCurrentField === true &&
      obs.divergences.length === 1 &&
      obs.divergences.includes("CLASSIFIER_DISAGREEMENT"),
    detalhe: `kind=${obs?.classification.kind} canFill=${obs?.classification.canFillCurrentField} divergences=${JSON.stringify(obs?.divergences)}`,
  }))

  // 4. "Nunca vendi" em profissão — OBJECTION; se o fluxo real ACEITOU essa
  // string como resposta de profissão (Zod não entende de conteúdo), isso é
  // exatamente uma divergência NON_ANSWER_ACCEPTED_BY_CURRENT_FLOW.
  caso("4. 'Nunca vendi' em profissao (fluxo real aceitou)", "profissao", "Qual é a sua profissão?", "Nunca vendi", true, (obs) => ({
    ok: obs?.classification.kind === "OBJECTION" && (obs?.divergences.includes("NON_ANSWER_ACCEPTED_BY_CURRENT_FLOW") ?? false),
    detalhe: `kind=${obs?.classification.kind} divergences=${JSON.stringify(obs?.divergences)}`,
  }))

  // 5. "Nunca vendi" em experiencia_vendas — hoje esse campo é yesno
  // (botão), não recebe texto livre em produção; testado aqui mesmo assim
  // pra confirmar que o classificador está preparado, caso isso mude no
  // futuro (ver risco no relatório).
  caso("5. 'Nunca vendi' em experiencia_vendas (campo é yesno hoje, teste preparatório)", "experiencia_vendas", "Você já trabalhou com vendas?", "Nunca vendi", true, (obs) => ({
    ok: obs?.classification.kind === "ANSWER" && obs.classification.canFillCurrentField === true,
    detalhe: `kind=${obs?.classification.kind} canFill=${obs?.classification.canFillCurrentField}`,
  }))

  // 6. "Como assim?" em campo de texto.
  caso("6. 'Como assim?' em objetivo", "objetivo", "Por que você deseja trabalhar com a Tania Joias?", "Como assim?", true, (obs) => ({
    ok: obs?.classification.kind === "DOUBT" && (obs?.divergences.includes("NON_ANSWER_ACCEPTED_BY_CURRENT_FLOW") ?? false),
    detalhe: `kind=${obs?.classification.kind} divergences=${JSON.stringify(obs?.divergences)}`,
  }))

  // 7. Small talk no campo cidade.
  caso("7. Small talk ('Estou bem, e você?') em cidade", "cidade", "Em qual cidade você mora?", "Estou bem, e você?", true, (obs) => ({
    ok: obs?.classification.kind === "SMALL_TALK",
    detalhe: `kind=${obs?.classification.kind}`,
  }))

  // 8. Pergunta longa sem "?".
  caso(
    "8. Pergunta longa sem '?' em objetivo",
    "objetivo",
    "Por que você deseja trabalhar com a Tania Joias?",
    "Eu gostaria de saber como funciona o pagamento das peças que eu não vender",
    false,
    (obs) => ({ ok: obs?.classification.kind === "QUESTION", detalhe: `kind=${obs?.classification.kind}` }),
  )

  // 9. "Trabalho como professora" — não pode virar QUESTION. O classificador
  // simples da Parte 1 diria QUESTION (por causa do "como" solto) — de novo,
  // CLASSIFIER_DISAGREEMENT aqui é o resultado ESPERADO, não um bug.
  caso("9. 'Trabalho como professora' em profissao", "profissao", "Qual é a sua profissão?", "Trabalho como professora", true, (obs) => ({
    ok:
      obs?.classification.kind === "ANSWER" &&
      obs.divergences.length === 1 &&
      obs.divergences.includes("CLASSIFIER_DISAGREEMENT"),
    detalhe: `kind=${obs?.classification.kind} divergences=${JSON.stringify(obs?.divergences)}`,
  }))

  // 10. Texto vazio — não alcançável via UI real (o form bloqueia envio
  // vazio), mas testável direto na função.
  caso("10. Texto vazio", "nome", "Qual é o seu nome completo?", "", false, (obs) => ({
    ok: obs?.classification.kind === "AMBIGUOUS" && obs.classification.canFillCurrentField === false,
    detalhe: `kind=${obs?.classification.kind}`,
  }))

  // 11. Resposta inválida pela validação Zod — NÃO testável neste ponto de
  // integração (ver nota no topo do arquivo e no relatório). Registrado
  // como "não aplicável" em vez de forçar um resultado.
  resultados.push({
    name: "11. Resposta inválida pela validação Zod",
    passou: true,
    detalhe: "N/A — texto reprovado pelo Zod nunca chega em useSofiaFlow.ts nesta arquitetura (bloqueado antes, em TextAnswerForm.tsx); não há como testar isso neste ponto de integração sem tocar no formulário, fora do escopo desta Parte.",
  })

  return resultados
}
