import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from './AuthContext'
import { ErroInline } from '../../components/ErroInline'

export function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const { error } = await signIn(email, password)
      if (error) {
        setError(error)
        return
      }
      navigate('/')
    } catch (err) {
      console.error('Erro inesperado ao entrar:', err)
      setError('Não foi possível entrar. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4">
      <form
        onSubmit={handleSubmit}
        className="surge w-full max-w-sm bg-surface p-6 sm:p-8 rounded-xl border border-border space-y-5 shadow-[0_16px_40px_-24px_color-mix(in_srgb,var(--foreground)_45%,transparent)]"
      >
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Entrar</h1>

        <div>
          <label className="block text-sm text-muted-foreground mb-1.5" htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-border-strong bg-surface text-foreground rounded-lg px-3.5 py-3 text-base transition-colors duration-150 focus:border-primary"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-sm text-muted-foreground" htmlFor="password">Senha</label>
            <Link to="/esqueci-senha" className="text-sm text-muted-foreground underline">
              Esqueci minha senha
            </Link>
          </div>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-border-strong bg-surface text-foreground rounded-lg px-3.5 py-3 pr-11 text-base transition-colors duration-150 focus:border-primary"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground transition-colors duration-150 hover:text-foreground"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <ErroInline>{error}</ErroInline>

        <button
          type="submit"
          disabled={submitting}
          className="w-full btn-primary rounded-lg px-3 py-3.5 text-base font-semibold disabled:opacity-50"
        >
          {submitting ? 'Entrando...' : 'Entrar'}
        </button>

        {/* Sem isto a tela de cadastro existe e ninguém chega nela: o anúncio
            leva à página de vendas, mas quem digita o endereço do CRM direto
            cai aqui. */}
        <p className="text-center text-sm text-muted-foreground">
          Ainda não tem conta?{' '}
          <Link to="/criar-conta" className="text-primary hover:underline">
            Criar conta grátis
          </Link>
        </p>
      </form>
    </div>
  )
}
