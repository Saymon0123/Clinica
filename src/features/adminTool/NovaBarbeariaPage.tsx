import { useState, type FormEvent } from 'react'
import { Lock, Plus, Send, Store } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { SalonWizard } from './SalonWizard'
import { SalonList } from './SalonList'
import { ConvidarBarbearia } from './ConvidarBarbearia'
import { MetricasDoProduto } from './MetricasDoProduto'

const SECRET_STORAGE_KEY = 'admin_tool_secret'

function AccessGate({ onUnlock }: { onUnlock: (secret: string) => void }) {
  const [value, setValue] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const secret = value.trim()
    if (!secret || checking) return

    setChecking(true)
    setError(null)
    try {
      // Valida a senha no servidor ANTES de liberar o painel.
      const { data, error: invokeError } = await supabase.functions.invoke('admin-create-salon', {
        headers: { 'x-admin-secret': secret },
        body: { action: 'verify' },
      })

      if (invokeError || data?.error || !data?.ok) {
        setError('Senha incorreta. Verifique e tente novamente.')
        return
      }

      sessionStorage.setItem(SECRET_STORAGE_KEY, secret)
      onUnlock(secret)
    } catch (err) {
      console.error('Erro ao validar senha administrativa:', err)
      setError('Não foi possível validar a senha agora. Verifique sua conexão e tente novamente.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-surface border border-border p-6 rounded-xl space-y-4">
        <div className="flex items-center gap-2 text-foreground">
          <Lock size={18} />
          <h1 className="text-lg font-semibold">Acesso restrito</h1>
        </div>
        <input
          type="password"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setError(null)
          }}
          placeholder="Senha de acesso"
          autoFocus
          className={`w-full border rounded px-3 py-2 text-sm bg-surface text-foreground ${
            error ? 'border-danger' : 'border-border-strong'
          }`}
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={checking || !value.trim()}
          className="w-full btn-primary rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          {checking ? 'Verificando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

export function NovaBarbeariaPage() {
  const [secret, setSecret] = useState<string | null>(() => sessionStorage.getItem(SECRET_STORAGE_KEY))
  const [aba, setAba] = useState<'lista' | 'nova' | 'convite'>('lista')
  const [refreshKey, setRefreshKey] = useState(0)

  if (!secret) {
    return <AccessGate onUnlock={setSecret} />
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="w-full max-w-2xl mx-auto space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Painel administrativo</h1>
          <p className="text-sm text-muted-foreground">Barbearias e redes cadastradas no sistema</p>
        </div>

        <div className="flex gap-1 border-b border-border">
          <button
            onClick={() => setAba('lista')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              aba === 'lista'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Store size={15} />
            Barbearias
          </button>
          <button
            onClick={() => setAba('nova')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              aba === 'nova'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Plus size={15} />
            Nova barbearia
          </button>
          <button
            onClick={() => setAba('convite')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              aba === 'convite'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Send size={15} />
            Convidar
          </button>
        </div>

        {aba === 'lista' ? (
          <div className="space-y-4">
            {/* Fica acima da lista de propósito: o funil é a primeira coisa a
                olhar, e a lista responde as perguntas que ele levanta. */}
            <MetricasDoProduto secret={secret} key={refreshKey} />
            <SalonList secret={secret} refreshKey={refreshKey} />
          </div>
        ) : aba === 'nova' ? (
          <SalonWizard secret={secret} onCreated={() => setRefreshKey((k) => k + 1)} />
        ) : (
          <ConvidarBarbearia secret={secret} onCriado={() => setRefreshKey((k) => k + 1)} />
        )}
      </div>
    </div>
  )
}
