import { useCallback, useRef, useState } from "react"
import type { FinalizeCandidatePayload, FinalizeCandidateResponse } from "@tania-joias/shared"

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
import { resolveNaturalConversationMode, type EffectiveNaturalConversationMode } from "@/orchestrator/naturalConversation/resolveMode"
import { observeShadowTurn } from "@/orchestrator/naturalConversation/shadowObserver"
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

function newId(): string {
  return crypto.randomUUID()
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

  // FEATURE-005 Parte 5: modo da "condução natural" (OFF/SHADOW — ACTIVE já
  // vem resolvido como SHADOW por `resolveNaturalConversationMode`). Mesmo
  // padrão do ref acima: buscado uma vez em `beginIntro`, fail-safe em
  // "OFF" (idêntico ao comportamento de hoje) até a resposta chegar.
  const naturalConversationModeRef = useRef<EffectiveNaturalConversationMode>("OFF")

  const pushBotLine = useCallback(async (text: string, delayMs: number) => {
    setBotTyping(true)
    await wait(delayMs)
    setBotTyping(false)
    setMessages((prev) => [...prev, { id: newId(), role: "bot", text }])
  }, [])

  const pushUserMessage = useCallback((text: string) => {
    setMessages((prev) => [...prev, { id: newId(), role: "user", text }])
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

        const textoPergunta = mensagem ?? SOFIA_STEPS[next].question
        await pushBotLine(textoPergunta, 450)
        orchestratorRef.current?.processTurn(
          { type: "bot_message", texto: textoPergunta, origem: mensagem ? "ia" : "roteiro" },
          { fase: "asking", answers: updatedAnswers },
        )
        return
      }

      if (updatedAnswers.trabalha === false) {
        setPhase("closing")
        for (const line of SOFIA_REJECTION_LINES) {
          await pushBotLine(line, CLOSING_LINE_DELAY_MS)
        }
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

  const submitAnswer = useCallback(
    (step: SofiaStep, value: string | number | boolean, displayText: string) => {
      pushUserMessage(displayText)

      const provisionalAnswers = { ...answers, [step.key]: value } as SofiaAnswers

      // Se a candidata não tem Instagram, o campo fica explicitamente null
      // (a etapa "instagram" nunca será perguntada, pois é pulada).
      if (step.key === "possui_instagram" && value === false) {
        provisionalAnswers.instagram = null
      }

      const action = orchestratorRef.current?.processTurn(
        { type: "user_answer", campo: step.key, valor: value },
        { fase: "asking", answers: provisionalAnswers },
      )

      void insertAnswer({
        sessionId,
        questionKey: step.key,
        questionLabel: step.question,
        answerValue: String(displayText),
      })

      // FEATURE-004: com a flag desligada, `perguntasIaAtivaRef.current` é
      // sempre `false` e este bloco nunca roda — comportamento idêntico ao
      // de sempre. Com a flag ligada, uma pergunta detectada NUNCA é
      // gravada como resposta nem avança a etapa — a Sofia responde e
      // retoma a mesma pergunta.
      const seraInterceptadaPelaFeature004 =
        perguntasIaAtivaRef.current && action?.type === "ANSWER_WITH_TOOL" && typeof value === "string"

      // FEATURE-005 Parte 4: observação SHADOW (mode "OFF" por padrão — ver
      // `shadowObserver.ts`). Só roda em campos de texto livre (nunca em
      // "trabalha", que continua 100% hardcoded). Nunca lança, nunca exibe
      // nada, nunca altera `action`/o fluxo abaixo — só observa o que JÁ foi
      // decidido por `action`/`seraInterceptadaPelaFeature004`.
      if (typeof value === "string" && step.key !== "trabalha") {
        const proximoIndice = findNextStepIndex(stepIndex + 1, provisionalAnswers)
        observeShadowTurn({
          mode: naturalConversationModeRef.current,
          sessionId,
          fieldKey: step.key,
          currentQuestion: step.question,
          nextQuestion: proximoIndice < SOFIA_STEPS.length ? SOFIA_STEPS[proximoIndice].question : undefined,
          candidateAnswer: value,
          currentFlowAcceptedAnswer: !seraInterceptadaPelaFeature004,
          knownContext: provisionalAnswers as Record<string, unknown>,
        })
      }

      if (seraInterceptadaPelaFeature004) {
        void handleCandidateQuestion(step, value)
        return
      }

      setAnswers(provisionalAnswers)
      void advanceAfterAnswer(provisionalAnswers, stepIndex + 1, step.key)
    },
    [answers, pushUserMessage, sessionId, stepIndex, advanceAfterAnswer, handleCandidateQuestion],
  )

  const beginIntro = useCallback(() => {
    if (introStarted.current) return
    introStarted.current = true

    void fetchSofiaConfig().then(({ perguntasIaAtiva, conducaoNaturalModo }) => {
      perguntasIaAtivaRef.current = perguntasIaAtiva

      const resolved = resolveNaturalConversationMode(conducaoNaturalModo)
      naturalConversationModeRef.current = resolved.effectiveMode
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
      for (const line of SOFIA_INTRO_LINES) {
        await pushBotLine(line, INTRO_LINE_DELAY_MS)
      }
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
