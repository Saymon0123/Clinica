import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './features/auth/AuthContext'
import { RequireAuth } from './features/auth/RequireAuth'
import { LoginPage } from './features/auth/LoginPage'
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage'
import { ResetPasswordPage } from './features/auth/ResetPasswordPage'
import { AppLayout } from './components/AppLayout'
import { AgendaPage } from './features/agenda/AgendaPage'
import { ClientesPage } from './features/clientes/ClientesPage'
import { FinanceiroPage } from './features/financeiro/FinanceiroPage'
import { EstoquePage } from './features/estoque/EstoquePage'
import { ProfissionaisPage } from './features/profissionais/ProfissionaisPage'

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
        <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route path="/" element={<AgendaPage />} />
          <Route path="/clientes" element={<ClientesPage />} />
          <Route path="/financeiro" element={<FinanceiroPage />} />
          <Route path="/estoque" element={<EstoquePage />} />
          <Route path="/profissionais" element={<ProfissionaisPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}

export default App
