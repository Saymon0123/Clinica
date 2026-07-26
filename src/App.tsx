import { Suspense, lazy } from 'react'
import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './features/auth/AuthContext'
import { SalonProvider } from './features/auth/SalonContext'
import { RequireAuth } from './features/auth/RequireAuth'
import { LoginPage } from './features/auth/LoginPage'
import { AppLayout } from './components/AppLayout'
import { AgendaPage } from './features/agenda/AgendaPage'

// Telas fora do caminho crítico entram sob demanda: o bundle inicial carrega
// só login + agenda, que é onde o usuário cai ao abrir o app.
const ForgotPasswordPage = lazy(() =>
  import('./features/auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })),
)
const ResetPasswordPage = lazy(() =>
  import('./features/auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })),
)
const ClientesPage = lazy(() =>
  import('./features/clientes/ClientesPage').then((m) => ({ default: m.ClientesPage })),
)
const FinanceiroPage = lazy(() =>
  import('./features/financeiro/FinanceiroPage').then((m) => ({ default: m.FinanceiroPage })),
)
const ConexaoPage = lazy(() =>
  import('./features/conexao/ConexaoPage').then((m) => ({ default: m.ConexaoPage })),
)
const CatalogoPage = lazy(() =>
  import('./features/catalogo/CatalogoPage').then((m) => ({ default: m.CatalogoPage })),
)
const WhatsAppWebPage = lazy(() =>
  import('./features/whatsappWeb/WhatsAppWebPage').then((m) => ({ default: m.WhatsAppWebPage })),
)
const NovaBarbeariaPage = lazy(() =>
  import('./features/adminTool/NovaBarbeariaPage').then((m) => ({ default: m.NovaBarbeariaPage })),
)
const EquipePage = lazy(() => import('./features/equipe/EquipePage').then((m) => ({ default: m.EquipePage })))
const AceitarConvitePage = lazy(() =>
  import('./features/equipe/AceitarConvitePage').then((m) => ({ default: m.AceitarConvitePage })),
)
const RedePage = lazy(() => import('./features/rede/RedePage').then((m) => ({ default: m.RedePage })))

function Carregando() {
  return <p className="p-6 text-sm text-muted-foreground">Carregando...</p>
}

function App() {
  return (
    <AuthProvider>
      <SalonProvider>
        <Suspense fallback={<Carregando />}>
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
              <Route path="/rede" element={<RedePage />} />
              <Route path="/conexao" element={<ConexaoPage />} />
            </Route>
          </Routes>
        </Suspense>
      </SalonProvider>
    </AuthProvider>
  )
}

export default App
