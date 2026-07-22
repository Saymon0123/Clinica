import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      })
      // Mesma mensagem de sucesso independente do e-mail existir ou não,
      // para não revelar quais e-mails têm cadastro no sistema.
      setSent(true)
    } catch (err) {
      console.error('Erro ao solicitar redefinição de senha:', err)
      setError('Não foi possível enviar o e-mail agora. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-sm bg-white dark:bg-gray-900 p-6 sm:p-8 rounded-lg shadow space-y-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Esqueci minha senha</h1>

        {sent ? (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Se houver uma conta cadastrada com esse e-mail, enviamos um link para redefinir a senha.
              Verifique também a caixa de spam.
            </p>
            <Link to="/login" className="block text-center text-sm text-gray-500 dark:text-gray-400 underline">
              Voltar para o login
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Informe o e-mail da sua conta. Vamos enviar um link para você criar uma nova senha.
            </p>

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

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded px-3 py-3 text-sm font-medium disabled:opacity-50"
            >
              {submitting ? 'Enviando...' : 'Enviar link de redefinição'}
            </button>

            <Link to="/login" className="block text-center text-sm text-gray-500 dark:text-gray-400 underline">
              Voltar para o login
            </Link>
          </form>
        )}
      </div>
    </div>
  )
}
