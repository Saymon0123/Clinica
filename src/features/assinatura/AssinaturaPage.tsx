import { CreditCard, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useSalon } from '../auth/useSalon'
import { useAssinatura, type Assinatura } from './useAssinatura'

function moeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarData(iso: string) {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

function Situacao({ assinatura }: { assinatura: Assinatura }) {
  const { status, diasRestantes, expirada, acessoAte } = assinatura

  if (expirada) {
    return (
      <div className="flex items-start gap-2 text-danger">
        <AlertTriangle size={18} className="shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">Teste encerrado em {formatarData(acessoAte!)}</p>
          <p className="text-sm text-muted-foreground">
            O agente continua atendendo seus clientes no WhatsApp. Para seguir usando o CRM, fale
            com o suporte para regularizar.
          </p>
        </div>
      </div>
    )
  }

  if (status === 'trial' && diasRestantes !== null) {
    return (
      <div className="flex items-start gap-2">
        <CheckCircle2 size={18} className="shrink-0 mt-0.5 text-success" />
        <div>
          <p className="font-medium text-foreground">
            Período de teste — {diasRestantes === 0 ? 'termina hoje' : `${diasRestantes} dias restantes`}
          </p>
          <p className="text-sm text-muted-foreground">
            Acesso liberado até {formatarData(acessoAte!)}, com tudo do plano incluído.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2">
      <CheckCircle2 size={18} className="shrink-0 mt-0.5 text-success" />
      <div>
        <p className="font-medium text-foreground">Assinatura ativa</p>
        <p className="text-sm text-muted-foreground">
          {acessoAte ? `Acesso liberado até ${formatarData(acessoAte)}.` : 'Sem data de vencimento.'}
        </p>
      </div>
    </div>
  )
}

export function AssinaturaPage() {
  const { salonId, salonName, loading: salonLoading } = useSalon()
  const { assinatura, loading } = useAssinatura(salonId)

  if (salonLoading || loading) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-start gap-3">
        <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary-soft text-primary-soft-foreground shrink-0">
          <CreditCard size={18} />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Assinatura</h1>
          <p className="text-sm text-muted-foreground">{salonName ?? 'Sua barbearia'}</p>
        </div>
      </div>

      {!assinatura ? (
        <p className="text-sm text-muted-foreground bg-surface-2 border border-border rounded-lg p-4">
          Esta barbearia foi cadastrada antes do controle de assinatura e ainda não tem um plano
          registrado. Fale com o suporte para regularizar — o acesso não é afetado.
        </p>
      ) : (
        <>
          <div className="bg-surface border border-border rounded-xl p-4 space-y-4">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Plano</p>
                <p className="text-lg font-semibold text-foreground">{assinatura.planoNome}</p>
              </div>
              {assinatura.valor != null && (
                <p className="text-sm text-muted-foreground tabular-nums">
                  {moeda(assinatura.valor)} / mês
                </p>
              )}
            </div>

            <div className="pt-3 border-t border-border">
              <Situacao assinatura={assinatura} />
            </div>
          </div>

          {/*
            O pagamento pelo próprio CRM (Asaas) é a etapa 2 desta funcionalidade.
            Enquanto não existe, a tela precisa dizer com todas as letras como
            pagar — senão o dono chega aqui, não encontra botão e conclui que o
            sistema está quebrado.
          */}
          <div className="bg-surface-2 border border-border rounded-lg p-4">
            <p className="text-sm font-medium text-foreground">Como pagar</p>
            <p className="text-sm text-muted-foreground mt-1">
              Por enquanto a cobrança é combinada direto com o suporte, e o pagamento pelo próprio
              CRM está a caminho. Assim que estiver disponível, o botão aparece aqui.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
