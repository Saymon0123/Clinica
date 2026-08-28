import { useCallback, useEffect, useRef, useState } from 'react'
import { BadgeCheck, Building2, CheckCircle2, MessageCircle, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSalon } from '../auth/useSalon'
import { AgentDashboard } from './AgentDashboard'
import { EstadoVazio } from '../../components/EstadoVazio'
import { SkeletonPagina } from '../../components/Skeleton'
import { PageHeader } from '../../components/PageHeader'
import { Tour } from '../tour/Tour'
import { PASSOS_CONEXAO } from '../tour/passos'

type Status = 'close' | 'connecting' | 'open'

type Conexao = {
  provedor: 'cloud_api' | 'evolution' | null
  status: Status
  phone_number_id: string | null
}

type EstadoConexao = { conexao: Conexao | null; erro: boolean }

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

/**
 * Estado da conexão com o WhatsApp.
 *
 * Desde 2026-08-22 a conexão nova é a API OFICIAL da Meta (provedor
 * 'cloud_api'): não há QR code — o número é registrado junto com a nossa
 * equipe na entrada, e depois disso simplesmente funciona. A tela mostra isso
 * como fato consumado.
 *
 * O fluxo antigo da Evolution (QR code) continua aqui SÓ para as barbearias
 * que ainda não migraram — apagá-lo derrubaria quem depende dele hoje. Quando
 * a última unidade migrar, este bloco inteiro morre.
 */
export function ConexaoPage() {
  const { salonId, loading: salonLoading } = useSalon()
  const [estado, setEstado] = useState<EstadoConexao>({ conexao: null, erro: false })
  const [carregandoConexao, setCarregandoConexao] = useState(true)

  useEffect(() => {
    let ativo = true
    async function carregar() {
      if (!salonId) return
      setCarregandoConexao(true)
      const { data, error } = await supabase
        .from('whatsapp_connections')
        .select('provedor, status, phone_number_id')
        .eq('salon_id', salonId)
        .maybeSingle()
      if (!ativo) return
      // Erro NÃO cai no caminho legado: mostraria QR code a uma barbearia da
      // API oficial. Erro é erro, com cara de erro.
      setEstado({ conexao: (data as Conexao | null) ?? null, erro: !!error })
      if (error) console.error('Erro ao carregar a conexão:', error)
      setCarregandoConexao(false)
    }
    carregar()
    return () => {
      ativo = false
    }
  }, [salonId])
  const conexao = estado.conexao

  if (salonLoading || carregandoConexao) {
    return <SkeletonPagina />
  }

  if (!salonId) {
    return (
      <EstadoVazio
        icone={Building2}
        titulo="Conta sem barbearia vinculada"
        descricao="Sua conta ainda não está vinculada a um salão. Fale com o administrador do sistema."
      />
    )
  }

  const oficial = conexao?.provedor === 'cloud_api'

  if (estado.erro) {
    return (
      <div>
        <PageHeader titulo="Conexão" />
        <p className="text-sm text-danger">
          Não foi possível verificar a conexão do WhatsApp agora. Confira a internet e recarregue a
          página.
        </p>
      </div>
    )
  }

  return (
    <div>
      <PageHeader titulo="Conexão" subtitulo="O WhatsApp que o agente usa para atender" />

      {oficial ? (
        <div className="bg-surface rounded-xl border border-border shadow-sm p-5 max-w-md">
          {/* Sem data-tour aqui: as âncoras do tour vivem no fluxo legado da
              Evolution (QR), e âncora repetida quebra o passo a passo. */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-success-soft flex items-center justify-center text-success">
              <MessageCircle size={20} />
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                WhatsApp
                <BadgeCheck size={16} className="text-success" />
              </div>
              <div className="text-xs text-muted-foreground">
                {conexao?.phone_number_id ? 'Conectado pela API oficial da Meta' : 'Registro em andamento'}
              </div>
            </div>
          </div>

          {conexao?.phone_number_id ? (
            <div className="flex items-start gap-2 text-success bg-success-soft rounded-lg px-3 py-2 text-sm">
              <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
              <span>
                Seu número está conectado pela API oficial do WhatsApp — sem QR code, sem celular
                ligado, sem risco de banimento. O agente atende sozinho.
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              O registro do seu número na API oficial é feito junto com a nossa equipe. Se ainda não
              foi concluído, fale com o suporte.
            </p>
          )}

          <p className="text-xs text-muted-foreground mt-3">
            Precisa trocar o número da barbearia? Fale com o suporte — a troca é feita com a nossa
            equipe para o histórico das conversas não se perder.
          </p>
        </div>
      ) : (
        <ConexaoEvolutionLegada salonId={salonId} />
      )}

      <div data-tour="conexao-agente" className="mt-8">
        <AgentDashboard salonId={salonId} />
      </div>

      <Tour chave="conexao" passos={PASSOS_CONEXAO} />
    </div>
  )
}

/** O fluxo antigo por QR code, vivo só até a última barbearia migrar. */
function ConexaoEvolutionLegada({ salonId }: { salonId: string }) {
  const [status, setStatus] = useState<Status>('close')
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [webhookAviso, setWebhookAviso] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const failuresRef = useRef(0)

  const checkStatus = useCallback(async () => {
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
    checkStatus()
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [checkStatus])

  async function handleConnect() {
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

  return (
    <div className="bg-surface rounded-xl border border-border shadow-sm p-5 max-w-md">
      <div data-tour="conexao-status" className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-success-soft flex items-center justify-center text-success">
          <MessageCircle size={20} />
        </div>
        <div>
          <div className="text-sm font-medium text-foreground">WhatsApp</div>
          <div className="text-xs text-muted-foreground">
            {status === 'open' ? 'Conectado' : status === 'connecting' ? 'Aguardando leitura do QR code' : 'Não conectado'}
          </div>
        </div>
      </div>

      <div className="mb-3 rounded-lg border border-border bg-surface-2 p-3">
        <p className="text-xs text-muted-foreground">
          Esta unidade ainda usa a conexão por QR code. Em breve nossa equipe migra o número para a{' '}
          <strong>API oficial da Meta</strong> — sem QR, sem celular ligado e sem risco de bloqueio.
        </p>
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
        <div className="flex items-center gap-2 text-success bg-success-soft rounded-lg px-3 py-2 text-sm mb-4">
          <CheckCircle2 size={16} />
          WhatsApp conectado e pronto para uso.
        </div>
      ) : qrCode ? (
        <div className="flex flex-col items-center gap-3 mb-4">
          <img
            src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
            alt="QR code para conectar o WhatsApp"
            className="w-56 h-56 border border-border rounded-md"
          />
          <p className="text-xs text-muted-foreground text-center">
            Abra o WhatsApp no celular do salão → Aparelhos conectados → Conectar um aparelho, e escaneie o código.
          </p>
        </div>
      ) : null}

      <div data-tour="conexao-acao" className="flex gap-2">
        {status === 'open' ? (
          <button
            onClick={handleDisconnect}
            disabled={loading}
            className="flex-1 btn-secondary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Desconectando...' : 'Desconectar'}
          </button>
        ) : (
          <button
            onClick={handleConnect}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            {qrCode ? 'Gerar novo QR code' : 'Conectar WhatsApp'}
          </button>
        )}
      </div>
    </div>
  )
}
