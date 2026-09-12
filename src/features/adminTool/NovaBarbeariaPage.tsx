import { useEffect, useState, type FormEvent } from 'react'
import { Lock, Plus, Send, Store } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { SalonWizard } from './SalonWizard'
import { SalonList } from './SalonList'
import { ConvidarBarbearia } from './ConvidarBarbearia'
import { MetricasDoProduto } from './MetricasDoProduto'
import { PageHeader } from '../../components/PageHeader'
import { ErroInline } from '../../components/ErroInline'

/**
 * A chave onde a senha administrativa ERA guardada, em texto claro, até
 * 12/09/2026. Continua aqui só para ser apagada de quem já usou o painel: o
 * `sessionStorage` sobrevive ao recarregamento da aba, então sem esta limpeza
 * o valor antigo ficaria lá até a aba ser fechada.
 */
const CHAVE_ANTIGA = 'admin_tool_secret'

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

      // A senha NÃO é guardada. Ela vive só na memória do componente,
      // enquanto o painel estiver aberto. Ver o comentário do componente.
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
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-surface border border-border p-5 rounded-xl space-y-4">
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
          className={`w-full border rounded-lg px-3 py-2 text-sm bg-surface text-foreground ${
            error ? 'border-danger' : 'border-border-strong'
          }`}
        />
        <ErroInline>{error}</ErroInline>
        <button
          type="submit"
          disabled={checking || !value.trim()}
          className="w-full btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          {checking ? 'Verificando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

/**
 * Painel administrativo — cadastrar barbearia, convidar dono, ver o funil.
 *
 * **A senha não é guardada em lugar nenhum.** Até 12/09/2026 ela ia para o
 * `sessionStorage` em texto claro, para o painel continuar destravado depois de
 * recarregar a página. O CodeQL acusou na primeira vez que rodou
 * (`js/clear-text-storage-of-sensitive-data`), e ele tinha razão: esta rota é
 * **pública** (fica ao lado de `/login` e `/agendar/:salonId` no App), e o
 * `sessionStorage` é da ORIGEM inteira, não desta tela. Um XSS em qualquer
 * página do CRM, na mesma aba, lia a senha que libera criar barbearia.
 *
 * Agora ela vive só na memória do componente. O preço é recarregar a página
 * pedir a senha de novo — e é um preço pequeno: o formulário da SalonWizard já
 * não sobrevivia ao recarregamento de qualquer jeito.
 *
 * O que NÃO mudou, e é o que sustenta a segurança de verdade: cada chamada
 * manda a senha no header `x-admin-secret` e o edge a confere no servidor, em
 * comparação de tempo constante. Este portão é conveniência; a tranca é lá.
 *
 * Se um dia a conveniência fizer falta, o caminho certo não é voltar a gravar
 * a senha: é o `verify` devolver um token curto e assinado, e os edges
 * aceitarem o token. Isso mexe em três edge functions e está no backlog.
 */
export function NovaBarbeariaPage() {
  const [secret, setSecret] = useState<string | null>(null)

  // Apaga a senha que as versões anteriores deixavam gravada. Idempotente e
  // barato; roda uma vez por montagem do painel.
  useEffect(() => {
    try {
      sessionStorage.removeItem(CHAVE_ANTIGA)
    } catch {
      // Navegador com storage bloqueado: não há o que apagar.
    }
  }, [])
  const [aba, setAba] = useState<'lista' | 'nova' | 'convite'>('lista')
  const [refreshKey, setRefreshKey] = useState(0)

  if (!secret) {
    return <AccessGate onUnlock={setSecret} />
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="w-full max-w-2xl mx-auto space-y-4">
        <PageHeader
          titulo="Painel administrativo"
          subtitulo="Barbearias e redes cadastradas no sistema"
        />

        <div className="flex gap-1 border-b border-border">
          <button
            onClick={() => setAba('lista')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              aba === 'lista'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Store size={16} />
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
            <Plus size={16} />
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
            <Send size={16} />
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
