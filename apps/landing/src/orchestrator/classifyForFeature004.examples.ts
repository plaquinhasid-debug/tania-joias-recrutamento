/**
 * FEATURE-005, Parte 7, Objetivo 11 — testes automatizados. Cobre o que dá
 * pra testar direto na função de classificação/roteamento (sem precisar do
 * `useSofiaFlow.ts` inteiro rodando no navegador) — os itens que dependem
 * do fluxo real de verdade (retomada visual da pergunta, avanço de etapa,
 * FEATURE-004 ponta a ponta) foram testados manualmente ao vivo, ver
 * relatório final.
 */
import {
  buildNonAnswerMessage,
  classifyMessageForFeature004,
  conservativeErrorFallback,
  looksCompatibleWithCurrentField,
  resolveExpectedValueTypeForKey,
  resolveFieldKindForStep,
} from "./classifyForFeature004"
import type { SofiaStep } from "@/data/sofia-script"

export interface Feature004ExampleResult {
  name: string
  passou: boolean
  detalhe: string
}

function fakeStep(key: string, question: string, kind: SofiaStep["kind"] = "text"): SofiaStep {
  return { key, question, kind, schema: undefined } as unknown as SofiaStep
}

export function runClassifyForFeature004Examples(): Feature004ExampleResult[] {
  const resultados: Feature004ExampleResult[] = []

  function check(name: string, esperado: unknown, obtido: unknown) {
    const passou = JSON.stringify(esperado) === JSON.stringify(obtido)
    resultados.push({ name, passou, detalhe: `esperado=${JSON.stringify(esperado)} obtido=${JSON.stringify(obtido)}` })
  }

  function classify(message: string, fieldKey: string, currentQuestion = "") {
    return classifyMessageForFeature004({
      message,
      currentFieldKey: fieldKey,
      currentQuestion,
      fieldKind: "TEXT",
      expectedValueType: "STRING",
    })
  }

  // 1. Pergunta longa sem "?" no campo profissão.
  let r = classify("Eu gostaria de saber como funciona a comissão", "profissao")
  check("1. Pergunta longa sem '?' em profissão -> QUESTION", "QUESTION", r.kind)

  // 2. Pergunta longa com "?".
  r = classify("Quero entender como funciona o pagamento das peças que não vender?", "objetivo")
  check("2. Pergunta longa com '?' -> QUESTION", "QUESTION", r.kind)

  // 3. "Trabalho como professora" no campo profissão.
  r = classify("Trabalho como professora", "profissao")
  check("3. 'Trabalho como professora' em profissão -> ANSWER, canFill=true", true, r.kind === "ANSWER" && r.canFillCurrentField)

  // 4. Pergunta sobre comissão não preenche profissão.
  r = classify("Gostaria de saber se preciso comprar o primeiro mostruário", "profissao")
  check("4. Pergunta sobre mostruário não preenche profissão", false, r.kind === "ANSWER" && r.canFillCurrentField)

  // 5. Pergunta sobre consignação não preenche cidade.
  r = classify("Quais cidades vocês atendem?", "cidade")
  check("5. Pergunta sobre cidades não preenche cidade", false, r.kind === "ANSWER" && r.canFillCurrentField)

  // 6. Pergunta sobre investimento não preenche objetivo.
  r = classify("Preciso investir algum valor pra começar?", "objetivo")
  check("6. Pergunta sobre investimento não preenche objetivo", false, r.kind === "ANSWER" && r.canFillCurrentField)

  // 8. Depois da retomada, "Sou professora" preenche profissão.
  r = classify("Sou professora", "profissao")
  check("8. 'Sou professora' em profissão -> ANSWER, canFill=true", true, r.kind === "ANSWER" && r.canFillCurrentField)

  // 9. "Tenho pouco tempo" preenche tempo disponível.
  r = classify("Tenho pouco tempo", "tempo_disponivel")
  check("9. 'Tenho pouco tempo' em tempo_disponivel -> ANSWER, canFill=true", true, r.kind === "ANSWER" && r.canFillCurrentField)

  // 10. "Nunca vendi" não preenche profissão.
  r = classify("Nunca vendi", "profissao")
  check("10. 'Nunca vendi' em profissão -> não preenche (OBJECTION)", false, r.kind === "ANSWER" && r.canFillCurrentField)

  // 11. "Como assim?" não preenche o campo.
  r = classify("Como assim?", "objetivo")
  check("11. 'Como assim?' -> DOUBT, não preenche", true, r.kind === "DOUBT" && !r.canFillCurrentField)

  // 12. Small talk não preenche o campo.
  r = classify("Estou bem, e você?", "cidade")
  check("12. Small talk não preenche o campo", true, r.kind === "SMALL_TALK" && !r.canFillCurrentField)

  // 13. Texto ambíguo não avança.
  r = classify("", "nome")
  check("13. Texto vazio -> AMBIGUOUS, não preenche", true, r.kind === "AMBIGUOUS" && !r.canFillCurrentField)

  // 14. "Tchau" não conclui a entrevista automaticamente (não preenche o campo).
  r = classify("Tchau", "objetivo")
  check("14. 'Tchau' -> END_CONVERSATION, não preenche", true, r.kind === "END_CONVERSATION" && !r.canFillCurrentField)

  // 16. Falha do classificador não trava a conversa — simulada passando um
  // input propositalmente hostil (currentFieldKey vazio, mensagem com "?").
  try {
    const semTravar = classifyMessageForFeature004({
      message: "Isso tem uma interrogação?",
      currentFieldKey: "",
      currentQuestion: "",
      fieldKind: "TEXT",
      expectedValueType: "STRING",
    })
    resultados.push({
      name: "16. Classificador nunca lança (mesmo com entrada hostil)",
      passou: semTravar.kind === "QUESTION",
      detalhe: `obtido=${JSON.stringify(semTravar)}`,
    })
  } catch (err) {
    resultados.push({ name: "16. Classificador nunca lança", passou: false, detalhe: `lançou: ${String(err)}` })
  }

  // Objetivo 6 — resolveFieldKindForStep/resolveExpectedValueTypeForKey.
  check("Objetivo 6: yesno -> fieldKind YES_NO", "YES_NO", resolveFieldKindForStep(fakeStep("trabalha", "x", "yesno")))
  check("Objetivo 6: chips -> fieldKind CHIPS", "CHIPS", resolveFieldKindForStep(fakeStep("tempo_disponivel", "x", "chips")))
  check("Objetivo 6: telefone -> expectedValueType PHONE", "PHONE", resolveExpectedValueTypeForKey("telefone" as never))
  check("Objetivo 6: instagram -> expectedValueType INSTAGRAM", "INSTAGRAM", resolveExpectedValueTypeForKey("instagram" as never))

  // Objetivo 5 — mensagens estáticas existem e nunca lançam.
  const kinds: Array<Parameters<typeof buildNonAnswerMessage>[1]> = ["DOUBT", "OBJECTION", "SMALL_TALK", "QUESTION", "AMBIGUOUS"]
  const todasTemMensagem = kinds.every((k) => typeof buildNonAnswerMessage("objetivo" as never, k) === "string")
  resultados.push({
    name: "Objetivo 5: todas as categorias não-resposta (exceto END_CONVERSATION, que tem fluxo próprio) têm mensagem estática",
    passou: todasTemMensagem,
    detalhe: kinds.map((k) => `${k}=${JSON.stringify(buildNonAnswerMessage("objetivo" as never, k))}`).join(" | "),
  })

  // END_CONVERSATION explicitamente NÃO tem mensagem de retomada (Parte 7.1,
  // Correção 1) — o encerramento é tratado por `handleAbandonment`, não por
  // `handleNonAnswerMessage`/`buildNonAnswerMessage`.
  check(
    "Parte 7.1: buildNonAnswerMessage(END_CONVERSATION) -> null (fluxo próprio de abandono)",
    null,
    buildNonAnswerMessage("objetivo" as never, "END_CONVERSATION"),
  )

  // ---------------------------------------------------------------------
  // FEATURE-005, Parte 7.1 — testes obrigatórios das 3 correções.
  // ---------------------------------------------------------------------

  // Teste 2 (nível classificador): "Tchau" -> END_CONVERSATION, não preenche
  // nenhum campo (pré-condição pra Correção 1: sem isso, `useSofiaFlow`
  // nunca saberia que deve abandonar em vez de repetir a pergunta).
  r = classify("Tchau", "objetivo")
  check("Parte 7.1 Teste 2: 'Tchau' -> END_CONVERSATION, canFill=false", true, r.kind === "END_CONVERSATION" && !r.canFillCurrentField)

  // Teste 4: pergunta longa sem "?" não preenche profissão — a classificação
  // em si NUNCA recebe a flag de IA (só texto/campo), então o resultado é
  // idêntico esteja a flag ligada ou desligada. A decisão de USAR IA ou
  // fallback estático pra responder é feita depois, só em `useSofiaFlow.ts`.
  r = classify("Eu gostaria de saber como funciona a comissão", "profissao")
  check(
    "Parte 7.1 Teste 4: pergunta longa não preenche profissão (classificação independe da flag de IA)",
    false,
    r.kind === "ANSWER" && r.canFillCurrentField,
  )

  // Teste 5: com a flag desligada, QUESTION tem uma mensagem de fallback
  // determinística própria (nunca null, nunca aciona IA).
  const mensagemFallbackQuestion = buildNonAnswerMessage("profissao" as never, "QUESTION")
  resultados.push({
    name: "Parte 7.1 Teste 5: QUESTION com flag desligada tem fallback estático (nunca null)",
    passou: typeof mensagemFallbackQuestion === "string" && mensagemFallbackQuestion.length > 0,
    detalhe: JSON.stringify(mensagemFallbackQuestion),
  })

  // Teste 7: falha do classificador + texto claramente compatível com
  // profissão -> ANSWER (a rede de segurança não pode virar excesso de
  // cautela a ponto de travar respostas óbvias).
  let fb = conservativeErrorFallback({
    message: "Sou vendedora autônoma",
    currentFieldKey: "profissao",
    currentQuestion: "",
    fieldKind: "TEXT",
    expectedValueType: "STRING",
  })
  check("Parte 7.1 Teste 7: fallback + 'Sou vendedora autônoma' em profissão -> ANSWER", true, fb.kind === "ANSWER" && fb.canFillCurrentField)

  // Teste 8: falha do classificador + pergunta sem "?" -> AMBIGUOUS, NUNCA
  // ANSWER (é exatamente o bug do incidente da Parte 6, agora também coberto
  // no caminho de fallback de erro, não só no caminho normal).
  fb = conservativeErrorFallback({
    message: "Gostaria de saber como funciona a comissão",
    currentFieldKey: "profissao",
    currentQuestion: "",
    fieldKind: "TEXT",
    expectedValueType: "STRING",
  })
  check(
    "Parte 7.1 Teste 8: fallback + pergunta sem '?' -> AMBIGUOUS, nunca ANSWER",
    true,
    fb.kind === "AMBIGUOUS" && !fb.canFillCurrentField,
  )

  // Teste 9: falha do classificador + "Quero parar" -> END_CONVERSATION.
  fb = conservativeErrorFallback({
    message: "Quero parar",
    currentFieldKey: "objetivo",
    currentQuestion: "",
    fieldKind: "TEXT",
    expectedValueType: "STRING",
  })
  check("Parte 7.1 Teste 9: fallback + 'Quero parar' -> END_CONVERSATION", "END_CONVERSATION", fb.kind)

  // Teste 10: AMBIGUOUS nunca é fillable (garante que `useSofiaFlow` nunca
  // avança etapa nesse caso) — checado tanto no caminho normal quanto no de
  // fallback.
  r = classify("", "nome")
  check("Parte 7.1 Teste 10: AMBIGUOUS (caminho normal) nunca preenche/avança", true, r.kind === "AMBIGUOUS" && !r.canFillCurrentField)
  fb = conservativeErrorFallback({ message: "???", currentFieldKey: "campo_desconhecido", currentQuestion: "", fieldKind: "TEXT", expectedValueType: "STRING" })
  resultados.push({
    name: "Parte 7.1 Teste 10b: AMBIGUOUS (caminho de fallback) nunca preenche/avança",
    passou: fb.kind !== "AMBIGUOUS" || !fb.canFillCurrentField,
    detalhe: JSON.stringify(fb),
  })

  // Teste 11: QUESTION nunca é fillable (garante que `useSofiaFlow` nunca
  // avança etapa quando a mensagem é uma pergunta, com a flag ligada OU
  // desligada — a flag só decide COMO ela é respondida, nunca SE o campo é
  // preenchido com o texto da pergunta).
  r = classify("Quais cidades vocês atendem?", "cidade")
  check("Parte 7.1 Teste 11: QUESTION nunca preenche/avança", true, r.kind === "QUESTION" && !r.canFillCurrentField)

  // Teste 12: ANSWER válida continua avançando (nenhuma regressão das
  // correções desta parte no caminho feliz).
  r = classify("Sou professora", "profissao")
  check("Parte 7.1 Teste 12: ANSWER válida continua preenchendo/avançando", true, r.kind === "ANSWER" && r.canFillCurrentField)

  // -----------------------------------------------------------------------
  // FEATURE-005, Parte 7.1 (2ª rodada) — 10 testes obrigatórios do spec de
  // hardening revisado. Itens 1, 4 e 5 dependem do fluxo real (UI/hook) e
  // foram verificados manualmente ao vivo — ver relatório final.
  // -----------------------------------------------------------------------

  // Teste 2: "Não quero continuar" -> ABANDONED (classificador principal já
  // reconhece essa frase exata em END_CONVERSATION_MARKERS desde a Parte 2).
  r = classify("Não quero continuar", "objetivo")
  check("Parte 7.1 (2ª rodada) Teste 2: 'Não quero continuar' -> END_CONVERSATION", true, r.kind === "END_CONVERSATION" && !r.canFillCurrentField)

  // Teste 3: flag IA OFF + pergunta longa -> não salva. A classificação em
  // si nunca recebe a flag (só decide DEPOIS, em `useSofiaFlow.ts`, se
  // QUESTION é respondida por IA ou fallback) — resultado idêntico com a
  // flag ligada ou desligada.
  r = classify("Eu gostaria de saber como funciona a comissão", "profissao")
  check("Parte 7.1 (2ª rodada) Teste 3: pergunta longa nunca salva (independente da flag)", false, r.kind === "ANSWER" && r.canFillCurrentField)

  // Teste 6: erro no classificador + "Moro em Santo André" (cidade) -> ANSWER.
  fb = conservativeErrorFallback({
    message: "Moro em Santo André",
    currentFieldKey: "cidade",
    currentQuestion: "",
    fieldKind: "TEXT",
    expectedValueType: "STRING",
  })
  check("Parte 7.1 (2ª rodada) Teste 6: fallback + 'Moro em Santo André' em cidade -> ANSWER", true, fb.kind === "ANSWER" && fb.canFillCurrentField)

  // Teste 7: erro no classificador + "Gostaria de saber" -> AMBIGUOUS (nunca
  // ANSWER só por não bater em nenhum marcador forte — a guarda de
  // `looksCompatibleWithCurrentField` também precisa reconhecer frases de
  // pergunta indireta, não só palavras interrogativas isoladas).
  fb = conservativeErrorFallback({
    message: "Gostaria de saber",
    currentFieldKey: "profissao",
    currentQuestion: "",
    fieldKind: "TEXT",
    expectedValueType: "STRING",
  })
  check("Parte 7.1 (2ª rodada) Teste 7: fallback + 'Gostaria de saber' -> AMBIGUOUS", true, fb.kind === "AMBIGUOUS" && !fb.canFillCurrentField)

  // Teste 8: erro no classificador + "Tchau" -> END_CONVERSATION.
  fb = conservativeErrorFallback({
    message: "Tchau",
    currentFieldKey: "objetivo",
    currentQuestion: "",
    fieldKind: "TEXT",
    expectedValueType: "STRING",
  })
  check("Parte 7.1 (2ª rodada) Teste 8: fallback + 'Tchau' -> END_CONVERSATION", "END_CONVERSATION", fb.kind)

  // Teste 9 (Correção 4) — validação direta de `looksCompatibleWithCurrentField()`
  // com os exemplos exatos do spec.
  check("Correção 4: profissão + 'Sou professora' -> compatível", true, looksCompatibleWithCurrentField("profissao", "Sou professora"))
  check("Correção 4: profissão + 'Trabalho como manicure' -> compatível", true, looksCompatibleWithCurrentField("profissao", "Trabalho como manicure"))
  check("Correção 4: cidade + 'Moro em Mauá' -> compatível", true, looksCompatibleWithCurrentField("cidade", "Moro em Mauá"))
  check("Correção 4: telefone + '11998765432' -> compatível", true, looksCompatibleWithCurrentField("telefone", "11998765432"))
  check(
    "Correção 4: profissão + 'Gostaria de saber como funciona' -> NÃO compatível",
    false,
    looksCompatibleWithCurrentField("profissao", "Gostaria de saber como funciona"),
  )

  // Teste 10: nenhuma regressão nos testes antigos — reconfirma um caso de
  // cada rodada anterior continua com o mesmo resultado.
  r = classify("Tenho pouco tempo", "tempo_disponivel")
  check("Parte 7.1 (2ª rodada) Teste 10a: 'Tenho pouco tempo' continua ANSWER em tempo_disponivel", true, r.kind === "ANSWER" && r.canFillCurrentField)
  r = classify("Nunca vendi", "profissao")
  check("Parte 7.1 (2ª rodada) Teste 10b: 'Nunca vendi' continua não preenchendo profissão", false, r.kind === "ANSWER" && r.canFillCurrentField)

  // -----------------------------------------------------------------------
  // QUALIFICACAO-002, Parte 1 — proteção do novo campo "estabilidade_profissional"
  // (achado da investigação: sem isso, clicar num chip desta etapa seria
  // rejeitado pela camada de integridade da Parte 7.1).
  // -----------------------------------------------------------------------

  r = classify("Fixa — mesma empresa/local, mesma escala", "estabilidade_profissional")
  check("QUALIFICACAO-002: chip 'Fixa' -> ANSWER, canFill=true", true, r.kind === "ANSWER" && r.canFillCurrentField)

  r = classify("Variável, mas recorrente", "estabilidade_profissional")
  check("QUALIFICACAO-002: chip 'Variável, mas recorrente' -> ANSWER, canFill=true", true, r.kind === "ANSWER" && r.canFillCurrentField)

  r = classify("Esporádica, sem muita regularidade", "estabilidade_profissional")
  check("QUALIFICACAO-002: chip 'Esporádica' -> ANSWER, canFill=true", true, r.kind === "ANSWER" && r.canFillCurrentField)

  // Pergunta comercial no meio desta etapa continua sendo reconhecida como
  // QUESTION (não vira resposta), exatamente como em qualquer outro campo.
  r = classify("Qual é a comissão que eu ganho?", "estabilidade_profissional")
  check("QUALIFICACAO-002: pergunta comercial nesta etapa -> QUESTION, não preenche", true, r.kind === "QUESTION" && !r.canFillCurrentField)

  fb = conservativeErrorFallback({
    message: "Fixa — mesma empresa/local, mesma escala",
    currentFieldKey: "estabilidade_profissional",
    currentQuestion: "",
    fieldKind: "CHIPS",
    expectedValueType: "STRING",
  })
  check("QUALIFICACAO-002: fallback de erro também aceita o chip 'Fixa' -> ANSWER", true, fb.kind === "ANSWER" && fb.canFillCurrentField)

  check(
    "QUALIFICACAO-002: resolveFieldKindForStep(chips) -> CHIPS",
    "CHIPS",
    resolveFieldKindForStep(fakeStep("estabilidade_profissional", "x", "chips")),
  )
  check(
    "QUALIFICACAO-002: resolveExpectedValueTypeForKey(estabilidade_profissional) -> STRING (default seguro)",
    "STRING",
    resolveExpectedValueTypeForKey("estabilidade_profissional" as never),
  )

  return resultados
}
