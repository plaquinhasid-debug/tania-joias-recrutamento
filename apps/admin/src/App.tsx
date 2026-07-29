import { Navigate, Route, Routes } from "react-router-dom"

import { AppLayout } from "@/components/layout/AppLayout"
import { ProtectedRoute } from "@/routes/ProtectedRoute"
import LoginPage from "@/pages/LoginPage"
import DashboardPage from "@/pages/DashboardPage"
import LeadsPage from "@/pages/LeadsPage"
import CrmPage from "@/pages/CrmPage"
import ReportsPage from "@/pages/ReportsPage"
import RadarPage from "@/pages/RadarPage"
import SettingsPage from "@/pages/SettingsPage"

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="leads" element={<LeadsPage />} />
          <Route path="crm" element={<CrmPage />} />
          <Route path="relatorios" element={<ReportsPage />} />
          <Route path="radar" element={<RadarPage />} />
          <Route path="configuracoes" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
