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
import { ConexaoPage } from './features/conexao/ConexaoPage'
import { CatalogoPage } from './features/catalogo/CatalogoPage'
import { WhatsAppWebPage } from './features/whatsappWeb/WhatsAppWebPage'
import { NovaBarbeariaPage } from './features/adminTool/NovaBarbeariaPage'
import { EquipePage } from './features/equipe/EquipePage'
import { AceitarConvitePage } from './features/equipe/AceitarConvitePage'

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
        <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
        <Route path="/admin/nova-barbearia" element={<NovaBarbeariaPage />} />
        <Route path="/convite/:token" element={<AceitarConvitePage />} />
        <Route
          path="/web"
          element={
            <RequireAuth>
              <WhatsAppWebPage />
            </RequireAuth>
          }
        />
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
          <Route path="/catalogo" element={<CatalogoPage />} />
          <Route path="/equipe" element={<EquipePage />} />
          <Route path="/conexao" element={<ConexaoPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}

export default App
