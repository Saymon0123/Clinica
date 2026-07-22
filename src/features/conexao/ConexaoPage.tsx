import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, MessageCircle, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSalon } from '../auth/useSalon'

type Status = 'close' | 'connecting' | 'open'

async function callWhatsapp(action: 'connect' | 'status' | 'disconnect') {
  const { data, error } = await supabase.functions.invoke('whatsapp', {
    body: { action },
  })
  if (error) throw error
  return data as { status: Status; qrCode?: string | null; error?: string }
}

export function ConexaoPage() {
  const { salonId, loading: salonLoading } = useSalon()
  const [status, setStatus] = useState<Status>('close')
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const checkStatus = useCallback(async () => {
    try {
      const result = await callWhatsapp('status')
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
    }
  }, [])

  useEffect(() => {
    if (salonId) checkStatus()
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [salonId, checkStatus])

  async function handleConnect() {
    setLoading(true)
    setError(null)
    try {
      const result = await callWhatsapp('connect')
      if (result.error) {
        setError(result.error)
        return
      }
      setStatus(result.status)
      setQrCode(result.qrCode ?? null)

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
    setLoading(true)
    setError(null)
    try {
      const result = await callWhatsapp('disconnect')
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
    return <p className="text-sm text-gray-500">Carregando...</p>
  }

  if (!salonId) {
    return (
      <p className="text-sm text-gray-500">
        Sua conta ainda não está vinculada a um salão. Fale com o administrador do sistema.
      </p>
    )
  }

  return (
    <div>
      <h1 className="text-lg font-semibold text-gray-900 mb-4">Conexão</h1>

      <div className="bg-white rounded-lg shadow p-6 max-w-md">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-700">
            <MessageCircle size={20} />
          </div>
          <div>
            <div className="text-sm font-medium text-gray-900">WhatsApp</div>
            <div className="text-xs text-gray-500">
              {status === 'open' ? 'Conectado' : status === 'connecting' ? 'Aguardando leitura do QR code' : 'Não conectado'}
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        {status === 'open' ? (
          <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded px-3 py-2 text-sm mb-4">
            <CheckCircle2 size={16} />
            WhatsApp conectado e pronto para uso.
          </div>
        ) : qrCode ? (
          <div className="flex flex-col items-center gap-3 mb-4">
            <img
              src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
              alt="QR code para conectar o WhatsApp"
              className="w-56 h-56 border border-gray-200 rounded"
            />
            <p className="text-xs text-gray-500 text-center">
              Abra o WhatsApp no celular do salão → Aparelhos conectados → Conectar um aparelho, e escaneie o código.
            </p>
          </div>
        ) : null}

        <div className="flex gap-2">
          {status === 'open' ? (
            <button
              onClick={handleDisconnect}
              disabled={loading}
              className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm font-medium text-gray-700 disabled:opacity-50"
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
    </div>
  )
}
