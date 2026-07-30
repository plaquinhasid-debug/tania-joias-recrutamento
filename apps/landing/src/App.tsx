import { useState } from "react"

import { ChamadaFinal } from "@/components/sections/ChamadaFinal"
import { ComoFunciona } from "@/components/sections/ComoFunciona"
import { Depoimentos } from "@/components/sections/Depoimentos"
import { FAQ } from "@/components/sections/FAQ"
import { Footer } from "@/components/sections/Footer"
import { Header } from "@/components/sections/Header"
import { Hero } from "@/components/sections/Hero"
import { QuantoPossoGanhar } from "@/components/sections/QuantoPossoGanhar"
import { QuemSomos } from "@/components/sections/QuemSomos"
import { SofiaAssistant } from "@/components/sofia/SofiaAssistant"
import { useLandingTracking } from "@/hooks/useLandingTracking"
import { useSessionId } from "@/hooks/useSessionId"
import { useUtmParams } from "@/hooks/useUtmParams"

function App() {
  const [sofiaOpen, setSofiaOpen] = useState(false)
  const sessionId = useSessionId()
  const utm = useUtmParams()

  useLandingTracking(sessionId, utm)

  const openSofia = () => setSofiaOpen(true)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header onOpenSofia={openSofia} />

      <main>
        <Hero onOpenSofia={openSofia} />
        <QuemSomos onOpenSofia={openSofia} />
        <ComoFunciona onOpenSofia={openSofia} />
        <QuantoPossoGanhar />
        <Depoimentos />
        <FAQ />
        <ChamadaFinal onOpenSofia={openSofia} />
      </main>

      <Footer />

      <SofiaAssistant open={sofiaOpen} onOpenChange={setSofiaOpen} />
    </div>
  )
}

export default App
