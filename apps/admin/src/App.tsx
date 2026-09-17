import { Navigate, Route, Routes } from "react-router-dom"

import { AppLayout } from "@/components/layout/AppLayout"
import { ProtectedRoute } from "@/routes/ProtectedRoute"
import { EmbaixadoraProtectedRoute } from "@/routes/EmbaixadoraProtectedRoute"
import LoginPage from "@/pages/LoginPage"
import DashboardPage from "@/pages/DashboardPage"
import LeadsPage from "@/pages/LeadsPage"
import CrmPage from "@/pages/CrmPage"
import EmbaixadorasPage from "@/pages/EmbaixadorasPage"
import EmbaixadoraPortalPage from "@/pages/EmbaixadoraPortalPage"
import ReportsPage from "@/pages/ReportsPage"
import RadarPage from "@/pages/RadarPage"
import AbandonmentPage from "@/pages/AbandonmentPage"
import SettingsPage from "@/pages/SettingsPage"

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Equipe — ProtectedRoute/is_equipe() inalterados, ver
          ProtectedRoute.tsx. Nunca compartilha guard com a Embaixadora. */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="leads" element={<LeadsPage />} />
          <Route path="crm" element={<CrmPage />} />
          <Route path="embaixadoras" element={<EmbaixadorasPage />} />
          <Route path="relatorios" element={<ReportsPage />} />
          <Route path="radar" element={<RadarPage />} />
          <Route path="abandonos" element={<AbandonmentPage />} />
          <Route path="configuracoes" element={<SettingsPage />} />
        </Route>
      </Route>

      {/* Embaixadora — guard dedicado e isolado (E2.7-B), nunca a árvore
          acima nem o mesmo <AppLayout /> da equipe. */}
      <Route element={<EmbaixadoraProtectedRoute />}>
        <Route path="/portal-embaixadora" element={<EmbaixadoraPortalPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
