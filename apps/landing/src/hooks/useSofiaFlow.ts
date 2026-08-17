import { useCallback, useEffect, useRef, useState } from "react"
import type { FinalizeCandidatePayload, FinalizeCandidateResponse, KnowledgeSourceModeValue } from "@tania-joias/shared"

import { fetchSofiaConfig, fetchSofiaReacao, finalizeCandidate, insertAnswer } from "@/lib/api"
import { getFbp, getOrBuildFbc, getOrCaptureFbclid } from "@/lib/tracking"
import type { UtmParams } from "@/lib/tracking"
import {
  SOFIA_INTRO_LINES,
  SOFIA_REJECTION_LINES,
  SOFIA_STEPS,
  findNextStepIndex,
  type SofiaStep,
} from "@/data/sofia-script"
import { AIGateway, SupabaseAIProvider, answerCandidateQuestion, createSofiaOrchestrator } from "@/orchestrator"
import type { SofiaOrchestrator } from "@/orchestrator"
import {
  buildNonAnswerMessage,
  classifyMessageForFeature004,
  resolveExpectedValueTypeForKey,
  resolveFieldKindForStep,
} from "@/orchestrator/classifyForFeature004"
import type { CandidateMessageKind } from "@/orchestrator/classifyCandidateMessage"
import { resolveNaturalConversationMode, type EffectiveNaturalConversationMode } from "@/orchestrator/naturalConversation/resolveMode"
import { observeShadowTurn } from "@/orchestrator/naturalConversation/shadowObserver"
import { resolveReactionStrategy } from "@/orchestrator/naturalConversation/ReactionStrategyResolver"
import { getDeterministicAcknowledgment } from "@/orchestrator/naturalConversation/DeterministicReactionProvider"
import type { SofiaAnswerKey, SofiaAnswers, SofiaMessage, SofiaPhase } from "@/types/sofia"

/**
 * Campos onde a Sofia tenta uma reação contextual via IA (ver `sofia-reagir`)
 * antes de seguir com o texto estático do roteiro. Escopo intencionalmente
 * pequeno (2 pontos, não a cada pergunta) pra manter custo e latência baixos
 * — só onde a reação realmente muda a percepção da conversa.
 */
const CAMPOS_COM_REACAO_CONTEXTUAL: ReadonlySet<SofiaAnswerKey> = new Set(["profissao", "objetivo"])

const INTRO_LINE_DELAY_MS = 650
const CLOSING_LINE_DELAY_MS = 700
/** Timeout curto pro pipeline de perguntas (FEATURE-004) — mais apertado que o padrão do AIGateway (20s) pra nunca deixar a candidata esperando muito. */
const CANDIDATE_QUESTION_TIMEOUT_MS = 6000
/** Quanto tempo esperar parada, no meio da conversa, antes do nudge de reengajamento (só um por conversa). */
const IDLE_NUDGE_DELAY_MS = 90_000

function newId(): string {
  return crypto.randomUUID()
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Horário de exibição (HH:MM), estilo WhatsApp — só para a UI, não persistido. */
function formatTime(date: Date): string {
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}

interface UseSofiaFlowParams {
  sessionId: string
  utm: UtmParams
  origem?: string
  campanha?: string
}

export interface SofiaFlow {
  phase: SofiaPhase
  messages: SofiaMessage[]
  currentStep: SofiaStep | null
  botTyping: boolean
  answers: SofiaAnswers
  result: FinalizeCandidateResponse | null
  errorMessage: string | null
  reachedEnd: boolean
  beginIntro: () => void
  submitAnswer: (step: SofiaStep, value: string | number | boolean, displayText: string) => void
  retrySubmit: () => void
}

export function useSofiaFlow({ sessionId, utm, origem, campanha }: UseSofiaFlowParams): SofiaFlow {
  const [phase, setPhase] = useState<SofiaPhase>("intro")
  const [messages, setMessages] = useState<SofiaMessage[]>([])
  const [stepIndex, setStepIndex] = useState<number>(0)
  const [botTyping, setBotTyping] = useState(false)
  const [answers, setAnswers] = useState<SofiaAnswers>({})
  const [result, setResult] = useState<FinalizeCandidateResponse | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [reachedEnd, setReachedEnd] = useState(false)

  const introStarted = useRef(false)
  // Protege chamadas assíncronas concorrentes (StrictMode / cliques rápidos / retry).
  const runToken = useRef(0)

  // Reengajamento por inatividade — dado real (Admin > Abandonos,
  // 12/08/2026): quem interage às vezes some no meio, sem fechar o chat.
  // Um único nudge por conversa (nunca mais de um — não é pra parecer
  // insistente), só se a candidata ainda estiver esperando uma pergunta
  // (fase "asking") quando o tempo estourar. `phaseRef` existe só pra ler o
  // valor mais recente de dentro do `setTimeout` sem depender de closure.
  const phaseRef = useRef<SofiaPhase>("intro")
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])
  const idleNudgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idleNudgeShownRef = useRef(false)

  // RFC-002: o Orquestrador só OBSERVA a conversa por fora — nunca decide
  // nada, nunca pode alterar o que é perguntado ou como. Uma instância por
  // conversa (sem persistência entre sessões, ver `orchestrator/Memory.ts`).
  // RFC-010: montado via composition root (`createSofiaOrchestrator`) — este
  // hook nunca instancia `SofiaOrchestrator` nem conhece `SOFIA_PROFILE` diretamente.
  const orchestratorRef = useRef<SofiaOrchestrator | null>(null)
  if (orchestratorRef.current === null) {
    orchestratorRef.current = createSofiaOrchestrator(sessionId)
  }

  // FEATURE-004: liga/desliga a Sofia respondendo perguntas de negócio reais
  // no meio da conversa. Buscado uma vez em `beginIntro` (`fetchSofiaConfig`,
  // fail-closed em `false`) e guardado num ref — não precisa re-renderizar
  // nada quando muda, e o valor não pode mudar no meio de uma conversa já
  // em andamento.
  const perguntasIaAtivaRef = useRef(false)
  // Fonte de conhecimento fixada no começo da conversa. O fallback do
  // contrato de configuração é SHADOW; nunca muda no meio da sessão.
  const knowledgeSourceModeRef = useRef<KnowledgeSourceModeValue>("SHADOW")

  // FEATURE-005 Parte 5: modo da "condução natural" (OFF/SHADOW — ACTIVE já
  // vem resolvido como SHADOW por `resolveNaturalConversationMode`). Mesmo
  // padrão do ref acima: buscado uma vez em `beginIntro`, fail-safe em
  // "OFF" (idêntico ao comportamento de hoje) até a resposta chegar.
  const naturalConversationModeRef = useRef<EffectiveNaturalConversationMode>("OFF")

  // FEATURE-005 — próxima etapa: liga só a parte DETERMINÍSTICA (sem IA,
  // sem chamada de rede nova) da condução natural, reaproveitando os
  // reconhecimentos curtos já escritos em `DeterministicReactionProvider`.
  // Independente do ref acima (que só alimenta o shadow observer) — este
  // aqui reflete o `modo` bruto vindo de `sofia-config`, `true` só quando
  // `"ACTIVE"`. Os campos de estratégia `"AI"` (profissão, objetivo etc.)
  // continuam sem reação nenhuma até essa parte ser construída.
  const reconhecimentoDeterministicoAtivoRef = useRef(false)

  // Reagenda o nudge de inatividade toda vez que a Sofia "fala" — reinicia a
  // contagem enquanto a conversa avança normalmente. Não depende de
  // `pushBotLine` de propósito (evita ciclo entre os dois `useCallback`);
  // usa `setMessages` direto quando o tempo estoura.
  const scheduleIdleNudge = useCallback(() => {
    if (idleNudgeTimerRef.current) {
      clearTimeout(idleNudgeTimerRef.current)
      idleNudgeTimerRef.current = null
    }
    if (idleNudgeShownRef.current) return

    idleNudgeTimerRef.current = setTimeout(() => {
      idleNudgeTimerRef.current = null
      if (idleNudgeShownRef.current || phaseRef.current !== "asking") return
      idleNudgeShownRef.current = true
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "bot",
          text: "Ainda está por aí? 😊\n\nSem pressa — pode continuar quando quiser.",
          time: formatTime(new Date()),
        },
      ])
    }, IDLE_NUDGE_DELAY_MS)
  }, [])

  useEffect(() => {
    return () => {
      if (idleNudgeTimerRef.current) clearTimeout(idleNudgeTimerRef.current)
    }
  }, [])

  const pushBotLine = useCallback(
    async (text: string, delayMs: number) => {
      setBotTyping(true)
      await wait(delayMs)
      setBotTyping(false)
      setMessages((prev) => [...prev, { id: newId(), role: "bot", text, time: formatTime(new Date()) }])
      scheduleIdleNudge()
    },
    [scheduleIdleNudge],
  )

  const pushUserMessage = useCallback((text: string) => {
    setMessages((prev) => [...prev, { id: newId(), role: "user", text, time: formatTime(new Date()) }])
  }, [])

  const runSubmission = useCallback(
    async (finalAnswers: SofiaAnswers) => {
      const token = ++runToken.current
      setPhase("submitting")
      setErrorMessage(null)

      const payload: FinalizeCandidatePayload = {
        session_id: sessionId,
        nome: finalAnswers.nome ?? "",
        telefone: finalAnswers.telefone ?? "",
        cidade: finalAnswers.cidade,
        idade: finalAnswers.idade,
        trabalha: finalAnswers.trabalha ?? false,
        empresa_atual: finalAnswers.empresa_atual,
        profissao: finalAnswers.profissao,
        estabilidade_profissional: finalAnswers.estabilidade_profissional,
        experiencia_vendas: finalAnswers.experiencia_vendas,
        instagram: finalAnswers.instagram ?? null,
        whatsapp: finalAnswers.whatsapp,
        tempo_disponivel: finalAnswers.tempo_disponivel,
        objetivo: finalAnswers.objetivo,
        origem,
        campanha,
        utm_source: utm.utm_source,
        utm_medium: utm.utm_medium,
        utm_campaign: utm.utm_campaign,
        utm_content: utm.utm_content,
        fbp: getFbp(),
        fbc: getOrBuildFbc(getOrCaptureFbclid()),
        fbclid: getOrCaptureFbclid(),
      }

      try {
        const response = await finalizeCandidate(payload)
        if (runToken.current !== token) return
        setResult(response)
        setReachedEnd(true)
        setPhase("result")

        if (response.status === "aprovada") {
          window.fbq?.("track", "Lead", {}, { eventID: response.lead_id })
        }
      } catch (err) {
        if (runToken.current !== token) return
        console.error("[sofia] falha ao finalizar candidatura", err)
        setErrorMessage(
          "Não conseguimos enviar suas respostas agora. Verifique sua conexão e tente novamente.",
        )
        setPhase("error")
      }
    },
    [sessionId, origem, campanha, utm.utm_source, utm.utm_medium, utm.utm_campaign, utm.utm_content],
  )

  const advanceAfterAnswer = useCallback(
    async (updatedAnswers: SofiaAnswers, fromIndex: number, answeredKey: SofiaAnswerKey) => {
      const next = findNextStepIndex(fromIndex, updatedAnswers)

      if (next < SOFIA_STEPS.length) {
        setStepIndex(next)
        setPhase("asking")

        let mensagem: string | null = null
        if (CAMPOS_COM_REACAO_CONTEXTUAL.has(answeredKey)) {
          // Mantém o indicador "digitando" (e o input desabilitado) durante
          // a busca da reação, pra não expor o input da próxima pergunta
          // antes da Sofia "responder".
          setBotTyping(true)
          mensagem = await fetchSofiaReacao({
            intent: "perguntar_proximo",
            campo: answeredKey,
            valor: String(updatedAnswers[answeredKey] ?? ""),
            proximaPerguntaBase: SOFIA_STEPS[next].question,
            respostasAnteriores: updatedAnswers,
          })
        }

        // FEATURE-005 (parte determinística) — reconhecimento curto antes da
        // próxima pergunta, só pros campos configurados como "DETERMINISTIC"
        // em `fieldReactionConfig.ts` (nome/cidade/idade/whatsapp/Instagram),
        // e só quando `sofia_conducao_natural` está "ACTIVE". Dado real
        // (Admin > Abandonos, 12/08/2026): boa parte de quem interage some
        // logo nas primeiras perguntas, antes de qualquer sinal de que a
        // Sofia "ouviu" a resposta.
        let reconhecimento: string | null = null
        if (
          reconhecimentoDeterministicoAtivoRef.current &&
          resolveReactionStrategy(answeredKey) === "DETERMINISTIC"
        ) {
          if (answeredKey === "nome") {
            const primeiroNome = String(updatedAnswers.nome ?? "").trim().split(/\s+/)[0]
            reconhecimento = primeiroNome ? `Prazer, ${primeiroNome}! 🌸` : null
          } else {
            reconhecimento = getDeterministicAcknowledgment(answeredKey)
          }
        }

        const textoPerguntaBase = mensagem ?? SOFIA_STEPS[next].question
        const textoPergunta = reconhecimento
          ? `${reconhecimento}\n\n${textoPerguntaBase}`
          : textoPerguntaBase
        await pushBotLine(textoPergunta, 450)
        orchestratorRef.current?.processTurn(
          { type: "bot_message", texto: textoPergunta, origem: mensagem ? "ia" : "roteiro" },
          { fase: "asking", answers: updatedAnswers },
        )
        return
      }

      if (updatedAnswers.trabalha === false) {
        setPhase("closing")
        await pushBotLine(SOFIA_REJECTION_LINES.join("\n\n"), CLOSING_LINE_DELAY_MS)
        orchestratorRef.current?.processTurn(
          { type: "conversation_ended", status: "concluida" },
          { fase: "closing", answers: updatedAnswers },
        )
        await runSubmission(updatedAnswers)
        return
      }

      if (CAMPOS_COM_REACAO_CONTEXTUAL.has(answeredKey)) {
        setBotTyping(true)
        const mensagem = await fetchSofiaReacao({
          intent: "fechar",
          campo: answeredKey,
          valor: String(updatedAnswers[answeredKey] ?? ""),
          respostasAnteriores: updatedAnswers,
        })
        if (mensagem) {
          await pushBotLine(mensagem, CLOSING_LINE_DELAY_MS)
          // Sem essa pausa, o React batiza a troca de fase (asking →
          // submitting) junto com o setMessages acima e a mensagem nunca
          // chega a ser pintada na tela antes do ChatTranscript desmontar.
          // Também dá um instante pra candidata realmente ler a despedida.
          await wait(900)
        } else {
          setBotTyping(false)
        }
      }

      orchestratorRef.current?.processTurn(
        { type: "conversation_ended", status: "concluida" },
        { fase: "submitting", answers: updatedAnswers },
      )

      await runSubmission(updatedAnswers)
    },
    [pushBotLine, runSubmission],
  )

  /**
   * FEATURE-004: a candidata digitou uma pergunta de negócio (ex.: "quanto
   * eu ganho de comissão?") em vez de responder de fato à etapa atual. Busca
   * a resposta (KnowledgeEngine → IA → ResponseComposer) e mostra numa
   * bolha; a pergunta original é retomada numa SEGUNDA bolha separada, em
   * vez de anexada na mesma mensagem via `currentQuestion`.
   *
   * Por quê: testado ao vivo e descoberto que a IA quase sempre fecha a
   * própria resposta com uma pergunta de engajamento (ex.: "Faz sentido pra
   * você?", parte do PLAYBOOK-001). Se `currentQuestion` fosse passado, o
   * `ResponseComposer` corretamente descartaria essa resposta por
   * `MULTIPLE_QUESTIONS` (regra do FEATURE-002.1: nunca duas perguntas na
   * mesma mensagem) — na prática isso fazia cair no fallback quase sempre.
   * Sem `currentQuestion`, a resposta da IA fica livre pra ter sua própria
   * pergunta (dentro do limite de 1), e a pergunta do roteiro vem depois,
   * numa fala separada — sem colidir com nenhuma política.
   *
   * NUNCA lança: `answerCandidateQuestion` já tem seu próprio fallback
   * seguro; o try/catch aqui é só uma rede adicional pra garantir que a
   * candidata nunca fica travada.
   */
  const handleCandidateQuestion = useCallback(
    async (step: SofiaStep, pergunta: string) => {
      setBotTyping(true)
      try {
        const gateway = new AIGateway({
          provider: new SupabaseAIProvider({ sessionId }),
          timeoutMs: CANDIDATE_QUESTION_TIMEOUT_MS,
        })
        const resultado = await answerCandidateQuestion({
          pergunta,
          sessionId,
          aiGateway: gateway,
          knowledgeSourceMode: knowledgeSourceModeRef.current,
        })
        setBotTyping(false)
        await pushBotLine(resultado.composed.message, 300)
        orchestratorRef.current?.processTurn(
          { type: "bot_message", texto: resultado.composed.message, origem: "ia" },
          { fase: "asking", answers },
        )
        await pushBotLine(step.question, 450)
      } catch (err) {
        console.warn("[sofia] falha ao responder pergunta da candidata, retomando a mesma etapa", err)
        setBotTyping(false)
        await pushBotLine(step.question, 300)
      }
    },
    [answers, pushBotLine, sessionId],
  )

  /**
   * FEATURE-005 Parte 7, Objetivo 5 (revisado na Parte 7.1) —
   * DOUBT/OBJECTION/SMALL_TALK/QUESTION(flag off)/AMBIGUOUS: nunca salva
   * como resposta, nunca avança, só empurra uma mensagem estática curta
   * (sem IA) e retoma a MESMA pergunta — mesmo padrão de "duas bolhas" do
   * `handleCandidateQuestion`. `END_CONVERSATION` NÃO passa mais por aqui —
   * tem fluxo próprio (`handleAbandonment`), ver Correção 1 da Parte 7.1.
   */
  const handleNonAnswerMessage = useCallback(
    async (step: SofiaStep, kind: CandidateMessageKind) => {
      const mensagem = buildNonAnswerMessage(step.key, kind)
      if (mensagem) {
        await pushBotLine(mensagem, 300)
      }
      await pushBotLine(step.question, 450)
    },
    [pushBotLine],
  )

  /**
   * FEATURE-005 Parte 7.1, Correção 1 — encerramento antecipado de verdade.
   * Diferente de `handleNonAnswerMessage`, NUNCA retoma a pergunta atual:
   * mostra uma despedida curta, marca a fase como "abandoned" (terminal —
   * esconde o input, ver `SofiaChatPanel.tsx`) e NUNCA chama
   * `finalize-candidate`/`runSubmission` — não gera aprovação, reprovação
   * nem análise final, porque a entrevista não foi concluída. O
   * Orquestrador (shadow, RFC-002) só é avisado pra fins de
   * observação/Simulator (`ConversationOutcome: "ABANDONED"`, já previsto
   * em `orchestrator/types.ts` desde o RFC-008) — não decide nada aqui.
   */
  const handleAbandonment = useCallback(
    async (finalAnswers: SofiaAnswers) => {
      setBotTyping(true)
      await wait(300)
      setBotTyping(false)
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "bot",
          // Texto exato pedido na Parte 7.1 (2ª rodada), Correção 1.
          text: "Sem problemas.\n\nObrigada pelo seu tempo.\n\nSe mudar de ideia estaremos aqui para conversar novamente.",
          time: formatTime(new Date()),
        },
      ])
      setPhase("abandoned")
      orchestratorRef.current?.processTurn(
        { type: "conversation_ended", status: "abandonada" },
        { fase: "abandoned", answers: finalAnswers },
      )
    },
    [],
  )

  const submitAnswer = useCallback(
    (step: SofiaStep, value: string | number | boolean, displayText: string) => {
      pushUserMessage(displayText)

      const provisionalAnswers = { ...answers, [step.key]: value } as SofiaAnswers

      // Se a candidata não tem Instagram, o campo fica explicitamente null
      // (a etapa "instagram" nunca será perguntada, pois é pulada).
      if (step.key === "possui_instagram" && value === false) {
        provisionalAnswers.instagram = null
      }

      // RFC-002/RFC-010: mantido só pelas outras responsabilidades do
      // Orchestrator shadow (WorkingMemory/Context/Plan, usadas pelo
      // Simulator) — a partir da Parte 7 do FEATURE-005, quem decide se a
      // FEATURE-004 intercepta a mensagem é `classifyMessageForFeature004`
      // (`classifyCandidateMessageContextual`, Parte 2) logo abaixo, NÃO
      // mais `action?.type` deste Orchestrator. `IntentClassifier.ts`
      // continua rodando aqui só por compatibilidade com o pipeline shadow
      // já existente (Simulator/cenários) — não decide mais nada visível.
      orchestratorRef.current?.processTurn(
        { type: "user_answer", campo: step.key, valor: value },
        { fase: "asking", answers: provisionalAnswers },
      )

      void insertAnswer({
        sessionId,
        questionKey: step.key,
        questionLabel: step.question,
        answerValue: String(displayText),
      })

      // FEATURE-005 Parte 7 (revisado na Parte 7.1, Correção 2): campos de
      // texto livre (nunca "trabalha", que continua 100% hardcoded, nem os
      // demais campos de botão — já excluídos porque só chegam aqui como
      // boolean, nunca string) passam pelo classificador contextual ANTES
      // de decidir se o texto pode preencher o campo atual.
      if (typeof value === "string" && step.key !== "trabalha") {
        const classification = classifyMessageForFeature004({
          message: value,
          currentFieldKey: step.key,
          currentQuestion: step.question,
          fieldKind: resolveFieldKindForStep(step),
          expectedValueType: resolveExpectedValueTypeForKey(step.key),
        })

        const podePreencherComoResposta = classification.kind === "ANSWER" && classification.canFillCurrentField

        // Camada de INTEGRIDADE (Parte 7.1, Correção 2) — protege os campos
        // SEMPRE, independente de `perguntasIaAtivaRef`. Isso é diferente do
        // resto da FEATURE-004: a flag nunca decidiu se um campo é
        // protegido, só decide (mais abaixo) se uma QUESTION é respondida
        // pela IA ou por um fallback determinístico. Ou seja: com a flag
        // desligada, texto que não pode preencher o campo continua NUNCA
        // sendo gravado nem avançando a etapa — isso NÃO é mais "flag off =
        // zero mudança de comportamento" (era assim até a Parte 7); a partir
        // daqui, flag off só desliga a resposta via IA, nunca a proteção.
        const seraInterceptada = !podePreencherComoResposta

        // FEATURE-005 Parte 4/5: observação SHADOW continua rodando em
        // paralelo, sem decidir nada — reaproveita a MESMA classificação já
        // calculada acima (Objetivo 1 da Parte 7: nunca duas classificações
        // paralelas pra decidir a mesma coisa).
        const proximoIndice = findNextStepIndex(stepIndex + 1, provisionalAnswers)
        observeShadowTurn({
          mode: naturalConversationModeRef.current,
          sessionId,
          fieldKey: step.key,
          currentQuestion: step.question,
          nextQuestion: proximoIndice < SOFIA_STEPS.length ? SOFIA_STEPS[proximoIndice].question : undefined,
          candidateAnswer: value,
          currentFlowAcceptedAnswer: !seraInterceptada,
          knownContext: provisionalAnswers as Record<string, unknown>,
        })

        if (seraInterceptada) {
          // Correção 1 — encerramento antecipado nunca retoma a pergunta.
          if (classification.kind === "END_CONVERSATION") {
            void handleAbandonment(provisionalAnswers)
            return
          }
          // Correção 2 — só QUESTION depende da flag: ligada, responde de
          // verdade via FEATURE-004/IA; desligada, usa a mensagem estática
          // de `buildNonAnswerMessage("QUESTION")` (nunca grava a pergunta
          // como resposta, nunca chama IA).
          if (classification.kind === "QUESTION" && perguntasIaAtivaRef.current) {
            void handleCandidateQuestion(step, value)
          } else {
            void handleNonAnswerMessage(step, classification.kind)
          }
          return
        }
      }

      setAnswers(provisionalAnswers)
      void advanceAfterAnswer(provisionalAnswers, stepIndex + 1, step.key)
    },
    [
      answers,
      pushUserMessage,
      sessionId,
      stepIndex,
      advanceAfterAnswer,
      handleCandidateQuestion,
      handleNonAnswerMessage,
      handleAbandonment,
    ],
  )

  const beginIntro = useCallback(() => {
    if (introStarted.current) return
    introStarted.current = true

    void fetchSofiaConfig().then(({ perguntasIaAtiva, conducaoNaturalModo, knowledgeSourceMode }) => {
      perguntasIaAtivaRef.current = perguntasIaAtiva
      knowledgeSourceModeRef.current = knowledgeSourceMode

      const resolved = resolveNaturalConversationMode(conducaoNaturalModo)
      naturalConversationModeRef.current = resolved.effectiveMode
      reconhecimentoDeterministicoAtivoRef.current = conducaoNaturalModo === "ACTIVE"
      // Objetivo 9 (Parte 5): log só em dev, sem nenhum dado da candidata —
      // só o modo carregado e a origem (distingue "ACTIVE tratado como
      // SHADOW" de um SHADOW real, por exemplo).
      if (import.meta.env.DEV) {
        console.debug("[NaturalConversationConfig]", {
          modoCarregado: resolved.effectiveMode,
          fonte: resolved.sourceTag,
        })
      }
    })

    orchestratorRef.current?.processTurn({ type: "intro_started" }, { fase: "intro", answers: {} })

    void (async () => {
      await pushBotLine(SOFIA_INTRO_LINES.join("\n\n"), INTRO_LINE_DELAY_MS)
      const first = findNextStepIndex(0, {})
      setStepIndex(first)
      setPhase("asking")
      await pushBotLine(SOFIA_STEPS[first].question, 400)
      orchestratorRef.current?.processTurn(
        { type: "bot_message", texto: SOFIA_STEPS[first].question, origem: "roteiro" },
        { fase: "asking", answers: {} },
      )
    })()
  }, [pushBotLine])

  const retrySubmit = useCallback(() => {
    void runSubmission(answers)
  }, [answers, runSubmission])

  const currentStep: SofiaStep | null =
    phase === "asking" && stepIndex < SOFIA_STEPS.length ? SOFIA_STEPS[stepIndex] : null

  return {
    phase,
    messages,
    currentStep,
    botTyping,
    answers,
    result,
    errorMessage,
    reachedEnd,
    beginIntro,
    submitAnswer,
    retrySubmit,
  }
}
