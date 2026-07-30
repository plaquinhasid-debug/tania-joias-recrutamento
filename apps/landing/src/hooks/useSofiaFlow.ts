import { useCallback, useRef, useState } from "react"
import type { FinalizeCandidatePayload, FinalizeCandidateResponse } from "@tania-joias/shared"

import { finalizeCandidate, insertAnswer } from "@/lib/api"
import { getFbp, getOrBuildFbc, getOrCaptureFbclid } from "@/lib/tracking"
import type { UtmParams } from "@/lib/tracking"
import {
  SOFIA_INTRO_LINES,
  SOFIA_REJECTION_LINES,
  SOFIA_STEPS,
  findNextStepIndex,
  type SofiaStep,
} from "@/data/sofia-script"
import type { SofiaAnswers, SofiaMessage, SofiaPhase } from "@/types/sofia"

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
    async (updatedAnswers: SofiaAnswers, fromIndex: number) => {
      const next = findNextStepIndex(fromIndex, updatedAnswers)

      if (next < SOFIA_STEPS.length) {
        setStepIndex(next)
        setPhase("asking")
        await pushBotLine(SOFIA_STEPS[next].question, 450)
        return
      }

      if (updatedAnswers.trabalha === false) {
        setPhase("closing")
        for (const line of SOFIA_REJECTION_LINES) {
          await pushBotLine(line, CLOSING_LINE_DELAY_MS)
        }
        await runSubmission(updatedAnswers)
        return
      }

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

      void insertAnswer({
        sessionId,
        questionKey: step.key,
        questionLabel: step.question,
        answerValue: String(displayText),
      })

      void advanceAfterAnswer(updatedAnswers, stepIndex + 1)
    },
    [answers, pushUserMessage, sessionId, stepIndex, advanceAfterAnswer],
  )

  const beginIntro = useCallback(() => {
    if (introStarted.current) return
    introStarted.current = true

    void (async () => {
      for (const line of SOFIA_INTRO_LINES) {
        await pushBotLine(line, INTRO_LINE_DELAY_MS)
      }
      const first = findNextStepIndex(0, {})
      setStepIndex(first)
      setPhase("asking")
      await pushBotLine(SOFIA_STEPS[first].question, 400)
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
