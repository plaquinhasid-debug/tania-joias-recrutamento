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
import { FichaPage } from "@/pages/FichaPage"
import { useLandingTracking } from "@/hooks/useLandingTracking"
import { useSessionId } from "@/hooks/useSessionId"
import { useUtmParams } from "@/hooks/useUtmParams"
import { PrivacyPolicy } from "@/pages/PrivacyPolicy"
import { EmbaixadoraConvitePage } from "@/pages/EmbaixadoraConvitePage"
import { SANITIZED_INVITE_PATH } from "@/lib/ambassadorInvite"

// `/ficha/:token` é uma página pública separada (formulário pós-aprovação,
// sem IA/chat) — sem router de verdade no projeto, então o desvio é feito
// aqui mesmo, olhando a URL antes de montar a Landing normal.
const FICHA_PATH_MATCH = /^\/ficha\/([^/]+)\/?$/

function LandingPage() {
  const [sofiaOpen, setSofiaOpen] = useState(false)
  const sessionId = useSessionId()
  const utm = useUtmParams()

  useLandingTracking(sessionId, utm)

  const openSofia = () => setSofiaOpen(true)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />

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

function App() {
  if (window.location.pathname === "/politica-de-privacidade") {
    return <PrivacyPolicy />
  }

  const fichaMatch = window.location.pathname.match(FICHA_PATH_MATCH)
  if (fichaMatch) {
    return <FichaPage token={fichaMatch[1]} />
  }

  // O token real (`/embaixadoras/convite/<TOKEN>`) já foi capturado e
  // removido da URL pelo script de bootstrap em index.html antes de
  // qualquer código React rodar — a essa altura o pathname já é sempre
  // exatamente esta rota sanitizada, sem segmento de token (ver
  // EmbaixadoraConvitePage.tsx e useAmbassadorInviteToken.ts). Renderizar
  // esta página em vez de LandingPage também garante que nenhum dos hooks
  // de tracking (useSessionId/useUtmParams/useLandingTracking, só chamados
  // dentro de LandingPage) monta para esta rota.
  if (window.location.pathname === SANITIZED_INVITE_PATH) {
    return <EmbaixadoraConvitePage />
  }

  return <LandingPage />
}

export default App
