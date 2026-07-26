import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, MessageCircle, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSalon } from '../auth/useSalon'
import { AgentDashboard } from './AgentDashboard'

type Status = 'close' | 'connecting' | 'open'

async function callWhatsapp(action: 'connect' | 'status' | 'disconnect', salonId: string) {
  // salonId é obrigatório: numa rede, sem ele a função cairia na primeira
  // unidade do usuário em vez da que está selecionada na tela.
  const { data, error } = await supabase.functions.invoke('whatsapp', {
    body: { action, salonId },
  })
  if (error) throw error
  return data as {
    status: Status
    qrCode?: string | null
    error?: string
    /** false quando a Evolution não ficou apontada para o fluxo do agente. */
    webhookOk?: boolean
  }
}

export function ConexaoPage() {
  const { salonId, loading: salonLoading } = useSalon()
  const [status, setStatus] = useState<Status>('close')
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [webhookAviso, setWebhookAviso] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const failuresRef = useRef(0)

  const checkStatus = useCallback(async () => {
    if (!salonId) return
    try {
      const result = await callWhatsapp('status', salonId)
      failuresRef.current = 0
      setError(null)
      setStatus(result.status)
      if (result.status === 'open') {
        setQrCode(null)
        if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
      }
    } catch (err) {
      console.error('Erro ao checar status do WhatsApp:', err)
      failuresRef.current += 1
      // Após 3 falhas seguidas, para de tentar e avisa (evita ficar preso em "Aguardando").
      if (failuresRef.current >= 3) {
        if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
        setError(
          'Não foi possível verificar o status da conexão. Verifique sua internet e tente gerar o QR code novamente.',
        )
      }
    }
  }, [salonId])

  useEffect(() => {
    if (salonId) checkStatus()
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [salonId, checkStatus])

  async function handleConnect() {
    if (!salonId) return
    setLoading(true)
    setError(null)
    try {
      const result = await callWhatsapp('connect', salonId)
      if (result.error) {
        setError(result.error)
        return
      }
      setStatus(result.status)
      setQrCode(result.qrCode ?? null)
      setWebhookAviso(result.webhookOk === false)

      failuresRef.current = 0
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = setInterval(checkStatus, 3000)
    } catch (err) {
      console.error('Erro ao conectar WhatsApp:', err)
      setError('Não foi possível gerar o QR code. Verifique se a Evolution API está acessível.')
    } finally {
      setLoading(false)
    }
  }

  async function handleDisconnect() {
    if (!salonId) return
    setLoading(true)
    setError(null)
    try {
      const result = await callWhatsapp('disconnect', salonId)
      setStatus(result.status)
      setQrCode(null)
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    } catch (err) {
      console.error('Erro ao desconectar WhatsApp:', err)
      setError('Não foi possível desconectar agora.')
    } finally {
      setLoading(false)
    }
  }

  if (salonLoading) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>
  }

  if (!salonId) {
    return (
      <p className="text-sm text-muted-foreground">
        Sua conta ainda não está vinculada a um salão. Fale com o administrador do sistema.
      </p>
    )
  }

  return (
    <div>
      <h1 className="text-lg font-semibold text-foreground mb-4">Conexão</h1>

      <div className="bg-surface rounded-xl border border-border p-6 max-w-md">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center text-green-700 dark:text-green-400">
            <MessageCircle size={20} />
          </div>
          <div>
            <div className="text-sm font-medium text-foreground">WhatsApp</div>
            <div className="text-xs text-muted-foreground">
              {status === 'open' ? 'Conectado' : status === 'connecting' ? 'Aguardando leitura do QR code' : 'Não conectado'}
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-danger mb-3">{error}</p>}

        {webhookAviso && (
          <div className="mb-3 rounded-lg border border-warning bg-warning/10 p-3">
            <p className="text-sm font-medium text-foreground">
              WhatsApp conecta, mas o atendimento automático não vai responder.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Não foi possível apontar a Evolution API para o fluxo do agente. Verifique o secret
              N8N_WEBHOOK_URL nas configurações das Edge Functions do Supabase e clique em conectar
              de novo.
            </p>
          </div>
        )}

        {status === 'open' ? (
          <div className="flex items-center gap-2 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/40 rounded px-3 py-2 text-sm mb-4">
            <CheckCircle2 size={16} />
            WhatsApp conectado e pronto para uso.
          </div>
        ) : qrCode ? (
          <div className="flex flex-col items-center gap-3 mb-4">
            <img
              src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
              alt="QR code para conectar o WhatsApp"
              className="w-56 h-56 border border-border rounded"
            />
            <p className="text-xs text-muted-foreground text-center">
              Abra o WhatsApp no celular do salão → Aparelhos conectados → Conectar um aparelho, e escaneie o código.
            </p>
          </div>
        ) : null}

        <div className="flex gap-2">
          {status === 'open' ? (
            <button
              onClick={handleDisconnect}
              disabled={loading}
              className="flex-1 border border-border-strong rounded px-3 py-2 text-sm font-medium text-foreground disabled:opacity-50"
            >
              {loading ? 'Desconectando...' : 'Desconectar'}
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 bg-green-700 text-white rounded px-3 py-2 text-sm font-medium hover:bg-green-800 disabled:opacity-50"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              {qrCode ? 'Gerar novo QR code' : 'Conectar WhatsApp'}
            </button>
          )}
        </div>
      </div>

      <div className="mt-8">
        <AgentDashboard salonId={salonId} />
      </div>
    </div>
  )
}
