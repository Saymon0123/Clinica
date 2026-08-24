import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './features/auth/AuthContext'
import { hashDeEntrada, mensagemDeErroDoRetorno } from './lib/recuperacaoSenha'
import { SalonProvider } from './features/auth/SalonContext'
import { RequireAuth } from './features/auth/RequireAuth'
import { RequireNetworkOwner } from './features/auth/RequireNetworkOwner'
import { RequireManager } from './features/auth/RequireManager'
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
// Sem guard de autenticação de propósito: são lidas por quem ainda não tem
// conta — o dono decidindo se aceita, e o cliente da barbearia que recebeu o
// link pelo agente. Exigir login para ler o que se aceita contraria o CDC 46.
const CriarContaPage = lazy(() =>
  import('./features/onboarding/CriarContaPage').then((m) => ({ default: m.CriarContaPage })),
)
// Página de vendas: é onde o anúncio e a prospecção caem. Pública, e fora do
// CRM — quem chega aqui não tem conta.
const VendasPage = lazy(() => import('./features/site/VendasPage').then((m) => ({ default: m.VendasPage })))
// Aberta pelo QR do balcão, por quem não tem conta nem vai ter.
const AgendaPublicaPage = lazy(() =>
  import('./features/agendaPublica/AgendaPublicaPage').then((m) => ({ default: m.AgendaPublicaPage })),
)
const TermosPage = lazy(() => import('./features/legal/TermosPage').then((m) => ({ default: m.TermosPage })))
const PrivacidadePage = lazy(() =>
  import('./features/legal/PrivacidadePage').then((m) => ({ default: m.PrivacidadePage })),
)
const ConfiguracoesPage = lazy(() =>
  import('./features/configuracoes/ConfiguracoesPage').then((m) => ({ default: m.ConfiguracoesPage })),
)
const AssinaturaPage = lazy(() =>
  import('./features/assinatura/AssinaturaPage').then((m) => ({ default: m.AssinaturaPage })),
)
const RedePage = lazy(() => import('./features/rede/RedePage').then((m) => ({ default: m.RedePage })))

function Carregando() {
  return <p className="p-6 text-sm text-muted-foreground">Carregando...</p>
}

/**
 * Leva para a tela de nova senha quem chegou pelo link de recuperação.
 *
 * O Supabase descarta o `redirectTo` quando a URL não está na lista de
 * permitidas do projeto e manda para a Site URL — o usuário clica no e-mail e
 * cai no login, sem entender por quê. Aqui o retorno é reconhecido pelos
 * tokens que vêm na URL, então o fluxo funciona mesmo com a configuração
 * errada. Corrigir a lista de permitidas continua sendo o conserto de raiz.
 */
function DesvioDeRecuperacao() {
  const { recuperandoSenha } = useAuth()
  const location = useLocation()

  if (recuperandoSenha && location.pathname !== '/redefinir-senha') {
    return <Navigate to="/redefinir-senha" replace />
  }
  // Link vencido ou já usado: o Supabase devolve o erro no fragmento e não
  // cria sessão. Mandar para a tela de pedir outro, que explica o motivo.
  if (mensagemDeErroDoRetorno(hashDeEntrada()) && location.pathname !== '/esqueci-senha') {
    return <Navigate to="/esqueci-senha" replace />
  }
  return null
}

function App() {
  return (
    <AuthProvider>
      <SalonProvider>
        <DesvioDeRecuperacao />
        <Suspense fallback={<Carregando />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/inicio" element={<VendasPage />} />
            <Route path="/criar-conta" element={<CriarContaPage />} />
            <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
            <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
            <Route path="/admin/nova-barbearia" element={<NovaBarbeariaPage />} />
            <Route path="/convite/:token" element={<AceitarConvitePage />} />
            <Route path="/agendar/:salonId" element={<AgendaPublicaPage />} />
            <Route path="/termos" element={<TermosPage />} />
            <Route path="/privacidade" element={<PrivacidadePage />} />
            <Route
              path="/web"
              element={
                <RequireAuth>
                  <RequireManager>
                    <WhatsAppWebPage />
                  </RequireManager>
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
              <Route
                path="/rede"
                element={
                  <RequireNetworkOwner>
                    <RedePage />
                  </RequireNetworkOwner>
                }
              />
              {/* A gestão de papéis migrou para /equipe (2026-08-25); o
                  redirect segura links antigos e o hábito de quem usava. */}
              <Route path="/rede/equipe" element={<Navigate to="/equipe" replace />} />
              <Route
                path="/assinatura"
                element={
                  <RequireManager>
                    <AssinaturaPage />
                  </RequireManager>
                }
              />
              <Route
                path="/conexao"
                element={
                  <RequireManager>
                    <ConexaoPage />
                  </RequireManager>
                }
              />
              <Route
                path="/configuracoes"
                element={
                  <RequireManager>
                    <ConfiguracoesPage />
                  </RequireManager>
                }
              />
            </Route>
          </Routes>
        </Suspense>
      </SalonProvider>
    </AuthProvider>
  )
}

export default App
