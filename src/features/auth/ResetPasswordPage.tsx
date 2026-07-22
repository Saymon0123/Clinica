import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('A senha precisa ter pelo menos 6 caracteres.')
      return
    }
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.')
      return
    }

    setSubmitting(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) {
        setError('Não foi possível redefinir a senha. O link pode ter expirado — solicite um novo.')
        return
      }
      navigate('/')
    } catch (err) {
      console.error('Erro ao redefinir senha:', err)
      setError('Não foi possível redefinir a senha. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white dark:bg-gray-900 p-6 sm:p-8 rounded-lg shadow space-y-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Criar nova senha</h1>

        <div>
          <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1" htmlFor="password">Nova senha</label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={6}
              autoComplete="new-password"
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

        <div>
          <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1" htmlFor="confirmPassword">Confirmar nova senha</label>
          <input
            id="confirmPassword"
            type={showPassword ? 'text' : 'password'}
            required
            minLength={6}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded px-3 py-3 text-base"
          />
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded px-3 py-3 text-sm font-medium disabled:opacity-50"
        >
          {submitting ? 'Salvando...' : 'Salvar nova senha'}
        </button>
      </form>
    </div>
  )
}
