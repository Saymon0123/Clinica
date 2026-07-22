import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from './AuthContext'

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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white dark:bg-gray-900 p-6 sm:p-8 rounded-lg shadow space-y-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Entrar</h1>

        <div>
          <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1" htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded px-3 py-3 text-base"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm text-gray-600 dark:text-gray-400" htmlFor="password">Senha</label>
            <Link to="/esqueci-senha" className="text-sm text-gray-500 dark:text-gray-400 underline">
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
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded px-3 py-3 pr-11 text-base"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 dark:text-gray-400"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded px-3 py-3 text-sm font-medium disabled:opacity-50"
        >
          {submitting ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
