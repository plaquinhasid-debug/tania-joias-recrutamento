import { useCallback, useRef, useState } from "react"
import type { FinalizeCandidatePayload, FinalizeCandidateResponse } from "@tania-joias/shared"

import { fetchSofiaReacao, finalizeCandidate, insertAnswer } from "@/lib/api"
import { getFbp, getOrBuildFbc, getOrCaptureFbclid } from "@/lib/tracking"
import type { UtmParams } from "@/lib/tracking"
import {
  SOFIA_INTRO_LINES,
  SOFIA_REJECTION_LINES,
  SOFIA_STEPS,
  findNextStepIndex,
  type SofiaStep,
} from "@/data/sofia-script"
import { SofiaOrchestrator } from "@/orchestrator"
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
  const orchestratorRef = useRef<SofiaOrchestrator | null>(null)
  if (orchestratorRef.current === null) {
    orchestratorRef.current = new SofiaOrchestrator(sessionId)
  }

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

  const submitAnswer = useCallback(
    (step: SofiaStep, value: string | number | boolean, displayText: string) => {
      const updatedAnswers = { ...answers, [step.key]: value } as SofiaAnswers

      // Se a candidata não tem Instagram, o campo fica explicitamente null
      // (a etapa "instagram" nunca será perguntada, pois é pulada).
      if (step.key === "possui_instagram" && value === false) {
        updatedAnswers.instagram = null
      }

      setAnswers(updatedAnswers)
      pushUserMessage(displayText)

      orchestratorRef.current?.processTurn(
        { type: "user_answer", campo: step.key, valor: value },
        { fase: "asking", answers: updatedAnswers },
      )

      void insertAnswer({
        sessionId,
        questionKey: step.key,
        questionLabel: step.question,
        answerValue: String(displayText),
      })

      void advanceAfterAnswer(updatedAnswers, stepIndex + 1, step.key)
    },
    [answers, pushUserMessage, sessionId, stepIndex, advanceAfterAnswer],
  )

  const beginIntro = useCallback(() => {
    if (introStarted.current) return
    introStarted.current = true

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
