import { useState, type FormEvent } from 'react'
import { AlertTriangle, Check, CreditCard, ExternalLink, X } from 'lucide-react'
import { useSalon } from '../auth/useSalon'
import { invokeFunction } from '../../lib/invokeFunction'
import { usePlano, type Plano, type StatusAssinatura } from './usePlano'

const RECURSOS_LABEL: Record<string, string> = {
  rede: 'Rede com várias unidades',
  lembretes: 'Lembrete e confirmação automática de agendamento',
  recuperacao: 'Recuperação de clientes sumidos',
  site: 'Site da barbearia',
}

const STATUS_LABEL: Record<StatusAssinatura, { texto: string; classe: string }> = {
  trial: { texto: 'Aguardando pagamento', classe: 'bg-warning/15 text-warning' },
  ativa: { texto: 'Ativa', classe: 'bg-success-soft text-success' },
  atrasada: { texto: 'Pagamento atrasado', classe: 'bg-danger-soft text-danger' },
  cancelada: { texto: 'Cancelada', classe: 'bg-surface-2 text-muted-foreground' },
}

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function AssinaturaPage() {
  const { salonId, salonName, unidades, isOwner, loading: salonLoading } = useSalon()
  const { planos, assinatura, loading, erro, recarregar } = usePlano(salonId)
  const [planoEscolhido, setPlanoEscolhido] = useState<Plano | null>(null)

  // A rede dá desconto por unidade; o preço mostrado precisa refletir isso.
  const unidadeAtual = unidades.find((u) => u.salonId === salonId)
  const unidadesDaRede = unidadeAtual?.organizationId
    ? unidades.filter((u) => u.organizationId === unidadeAtual.organizationId).length
    : 1
  const emRede = unidadesDaRede > 1

  if (salonLoading || loading) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>
  }

  if (!isOwner) {
    return (
      <p className="text-sm text-muted-foreground">
        Só o dono da barbearia tem acesso à assinatura.
      </p>
    )
  }

  if (!salonId) {
    return (
      <p className="text-sm text-muted-foreground">
        Escolha uma barbearia no menu de perfil para ver a assinatura dela.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Assinatura</h1>
        <p className="text-sm text-muted-foreground">
          Plano de {salonName ?? 'sua barbearia'}
          {emRede && ` · ${unidadesDaRede} unidades na rede, com desconto por unidade`}
        </p>
      </div>

      {erro && <p className="text-sm text-danger">{erro}</p>}

      {assinatura && (
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">
                  Plano {planos.find((p) => p.codigo === assinatura.planCodigo)?.nome ?? assinatura.planCodigo}
                </span>
                <span
                  className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${
                    STATUS_LABEL[assinatura.status].classe
                  }`}
                >
                  {STATUS_LABEL[assinatura.status].texto}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {assinatura.valor != null && `${moeda(assinatura.valor)} por mês`}
                {assinatura.proximoVencimento &&
                  ` · próximo vencimento em ${new Date(
                    `${assinatura.proximoVencimento}T12:00:00`,
                  ).toLocaleDateString('pt-BR')}`}
              </p>
            </div>
          </div>

          {assinatura.status === 'atrasada' && (
            <div className="mt-3 flex gap-2 rounded-lg border border-danger bg-danger-soft p-3">
              <AlertTriangle size={16} className="text-danger shrink-0 mt-0.5" />
              <p className="text-xs text-foreground">
                A última cobrança venceu e não foi paga. Regularize para não perder os recursos do
                plano.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {planos.map((plano) => {
          const preco = emRede ? plano.precoUnidadeRede : plano.precoUnidade
          const atual = assinatura?.planCodigo === plano.codigo && assinatura.status !== 'cancelada'
          const recursos = Object.entries(RECURSOS_LABEL)

          return (
            <div
              key={plano.codigo}
              className={`bg-surface border rounded-xl p-5 flex flex-col ${
                atual ? 'border-primary' : 'border-border'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-foreground">{plano.nome}</h2>
                {atual && (
                  <span className="text-[11px] font-medium rounded-full bg-primary-soft text-primary-soft-foreground px-2 py-0.5">
                    seu plano
                  </span>
                )}
              </div>

              <div className="mt-2">
                <span className="text-2xl font-semibold text-foreground">{moeda(preco)}</span>
                <span className="text-sm text-muted-foreground"> /mês por unidade</span>
              </div>
              {emRede && preco < plano.precoUnidade && (
                <p className="text-xs text-success mt-0.5">
                  Preço de rede — de {moeda(plano.precoUnidade)} por unidade
                </p>
              )}

              {plano.descricao && (
                <p className="mt-2 text-sm text-muted-foreground">{plano.descricao}</p>
              )}

              <ul className="mt-4 space-y-1.5 flex-1">
                {recursos.map(([chave, label]) => {
                  const incluso = plano.recursos[chave as keyof typeof plano.recursos] === true
                  return (
                    <li
                      key={chave}
                      className={`flex items-start gap-2 text-sm ${
                        incluso ? 'text-foreground' : 'text-muted-foreground/60'
                      }`}
                    >
                      {incluso ? (
                        <Check size={15} className="text-success shrink-0 mt-0.5" />
                      ) : (
                        <X size={15} className="shrink-0 mt-0.5" />
                      )}
                      {label}
                    </li>
                  )
                })}
              </ul>

              <button
                onClick={() => setPlanoEscolhido(plano)}
                disabled={atual && assinatura?.status === 'ativa'}
                className="mt-4 w-full flex items-center justify-center gap-2 btn-primary rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                <CreditCard size={15} />
                {atual && assinatura?.status === 'ativa'
                  ? 'Plano atual'
                  : atual
                    ? 'Continuar pagamento'
                    : assinatura
                      ? `Mudar para ${plano.nome}`
                      : `Assinar ${plano.nome}`}
              </button>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        O pagamento é processado pelo Asaas. Você escolhe pix, boleto ou cartão na tela de
        pagamento, e a assinatura renova todo mês.
      </p>

      {planoEscolhido && salonId && (
        <CheckoutModal
          salonId={salonId}
          plano={planoEscolhido}
          onClose={() => setPlanoEscolhido(null)}
          onCriada={recarregar}
        />
      )}
    </div>
  )
}

function CheckoutModal({
  salonId,
  plano,
  onClose,
  onCriada,
}: {
  salonId: string
  plano: Plano
  onClose: () => void
  onCriada: () => void
}) {
  const [nome, setNome] = useState('')
  const [cpfCnpj, setCpfCnpj] = useState('')
  const [telefone, setTelefone] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null)

  async function assinar(e: FormEvent) {
    e.preventDefault()
    const documento = cpfCnpj.replace(/\D/g, '')
    if (documento.length !== 11 && documento.length !== 14) {
      setErro('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).')
      return
    }

    setEnviando(true)
    setErro(null)
    const { data, error } = await invokeFunction<{ checkoutUrl: string | null }>(
      'asaas-checkout',
      { body: { salonId, plano: plano.codigo, nome, cpfCnpj: documento, telefone } },
      'Não foi possível iniciar a assinatura.',
    )
    setEnviando(false)

    if (error) {
      setErro(error)
      return
    }

    onCriada()
    if (data?.checkoutUrl) {
      setCheckoutUrl(data.checkoutUrl)
      // Abre já, mas mantém o link na tela: bloqueador de pop-up é comum.
      window.open(data.checkoutUrl, '_blank', 'noopener,noreferrer')
    } else {
      setErro('A assinatura foi criada, mas o link de pagamento não veio. Recarregue em instantes.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface rounded-xl border border-border w-full max-w-sm p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <CreditCard size={18} />
            Assinar {plano.nome}
          </h2>
          <button onClick={onClose} aria-label="Fechar" className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        {checkoutUrl ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              Assinatura criada. Conclua o pagamento na página do Asaas:
            </p>
            <a
              href={checkoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 btn-primary rounded px-3 py-2 text-sm font-medium"
            >
              <ExternalLink size={15} />
              Abrir pagamento
            </a>
            <p className="text-xs text-muted-foreground">
              Assim que o pagamento for confirmado, o plano é liberado automaticamente — não
              precisa avisar ninguém.
            </p>
            <button
              onClick={onClose}
              className="w-full border border-border-strong rounded px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-2"
            >
              Fechar
            </button>
          </div>
        ) : (
          <form onSubmit={assinar} className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Nome ou razão social</span>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
                placeholder="Quem aparece na nota"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">CPF ou CNPJ</span>
              <input
                value={cpfCnpj}
                onChange={(e) => setCpfCnpj(e.target.value)}
                inputMode="numeric"
                className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
                placeholder="Só números"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Celular (opcional)</span>
              <input
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                inputMode="numeric"
                className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
              />
            </label>

            {erro && <p className="text-sm text-danger">{erro}</p>}

            <button
              type="submit"
              disabled={enviando}
              className="w-full btn-primary rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              {enviando ? 'Criando assinatura...' : 'Ir para o pagamento'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
