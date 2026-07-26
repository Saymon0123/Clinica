import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { urlDeRedefinicaoDeSenha } from '../../lib/appUrl'

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
        redirectTo: urlDeRedefinicaoDeSenha(),
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
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm bg-surface p-6 sm:p-8 rounded-xl border border-border space-y-4">
        <h1 className="text-xl font-semibold text-foreground">Esqueci minha senha</h1>

        {sent ? (
          <>
            <p className="text-sm text-muted-foreground">
              Se houver uma conta cadastrada com esse e-mail, enviamos um link para redefinir a senha.
              Verifique também a caixa de spam.
            </p>
            <Link to="/login" className="block text-center text-sm text-muted-foreground underline">
              Voltar para o login
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Informe o e-mail da sua conta. Vamos enviar um link para você criar uma nova senha.
            </p>

            <div>
              <label className="block text-sm text-muted-foreground mb-1" htmlFor="email">E-mail</label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-border-strong bg-surface text-foreground rounded px-3 py-3 text-base"
              />
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full btn-primary rounded px-3 py-3 text-sm font-medium disabled:opacity-50"
            >
              {submitting ? 'Enviando...' : 'Enviar link de redefinição'}
            </button>

            <Link to="/login" className="block text-center text-sm text-muted-foreground underline">
              Voltar para o login
            </Link>
          </form>
        )}
      </div>
    </div>
  )
}
