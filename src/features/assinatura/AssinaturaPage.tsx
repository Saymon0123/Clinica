import { CreditCard, CheckCircle2, AlertTriangle, Clock } from 'lucide-react'
import { useSalon } from '../auth/useSalon'
import { useAssinatura, type Assinatura } from './useAssinatura'
import { DadosDeCobranca } from './DadosDeCobranca'
import { CancelarUso } from './CancelarUso'
import { CobrancaDaRede } from './CobrancaDaRede'
import { UsoDoSistema } from './UsoDoSistema'

function formatarData(iso: string) {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

/**
 * A situação do acesso no modelo por uso.
 *
 * Os estados do modelo antigo (assinatura ativa, aguardando Pix da
 * recorrência, troca agendada) morreram em 2026-08-24. O que resta descrever:
 * teste, em dia, boleto atrasado e vencido — todos derivados de `acesso_ate`,
 * que o webhook estende quando o boleto manual do fechamento é pago.
 */
function Situacao({ assinatura }: { assinatura: Assinatura }) {
  const { status, diasRestantes, expirada, acessoAte } = assinatura

  if (expirada) {
    return (
      <div className="flex items-start gap-2 text-danger">
        <AlertTriangle size={18} className="shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">Acesso vencido em {formatarData(acessoAte!)}</p>
          <p className="text-sm text-muted-foreground">
            O agente continua atendendo seus clientes no WhatsApp por alguns dias. Pague a última
            cobrança para voltar ao normal.
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
            Tudo liberado até {formatarData(acessoAte!)}. Depois, você paga só pelo que usar.
          </p>
        </div>
      </div>
    )
  }

  if (status === 'atrasada') {
    return (
      <div className="flex items-start gap-2">
        <AlertTriangle size={18} className="shrink-0 mt-0.5 text-warning" />
        <div>
          <p className="font-medium text-foreground">Cobrança em atraso</p>
          <p className="text-sm text-muted-foreground">
            {acessoAte
              ? `Seu acesso vai até ${formatarData(acessoAte)}. Pague a cobrança em aberto para continuar.`
              : 'Pague a cobrança em aberto para continuar.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2">
      <Clock size={18} className="shrink-0 mt-0.5 text-success" />
      <div>
        <p className="font-medium text-foreground">Acesso em dia</p>
        <p className="text-sm text-muted-foreground">
          {acessoAte ? `Pago até ${formatarData(acessoAte)}. ` : ''}A cobrança do mês fecha no dia
          1º e chega como boleto, só com o que foi usado.
        </p>
      </div>
    </div>
  )
}

export function AssinaturaPage() {
  const { salonId, salonName, loading: salonLoading } = useSalon()
  const { assinatura, loading, erro, reload } = useAssinatura(salonId)

  if (salonLoading || loading) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>
  }

  // Dono de rede sem unidade escolhida: o uso é por unidade, então não há o
  // que mostrar até ele escolher qual.
  if (!salonId) {
    return (
      <p className="text-sm text-muted-foreground">
        Escolha uma barbearia para ver o uso dela.
      </p>
    )
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-start gap-3">
        <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary-soft text-primary-soft-foreground shrink-0">
          <CreditCard size={18} />
        </span>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Assinatura</h1>
          <p className="text-sm text-muted-foreground">{salonName ?? 'Sua barbearia'}</p>
        </div>
      </div>

      {erro && (
        <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-lg p-4">
          {erro} Tente recarregar a página. Se continuar, avise o suporte.
        </p>
      )}

      {/* O medidor primeiro: é a página inteira agora — o que o mês está
          custando e o que o agente gerou em troca. */}
      <UsoDoSistema />

      {assinatura && (
        <div className="bg-surface border border-border rounded-xl shadow-sm p-4 space-y-4">
          <Situacao assinatura={assinatura} />
          {assinatura.status !== 'cancelada' && (
            <div className="pt-3 border-t border-border">
              <CancelarUso salonId={salonId} onMudou={reload} />
            </div>
          )}
        </div>
      )}

      {/* O CPF/CNPJ é o dado do pagante no boleto manual. */}
      <DadosDeCobranca
        salonId={salonId}
        documentoAtual={assinatura?.cpfCnpj ?? null}
        onSalvo={reload}
      />

      {/* Some sozinho fora de rede: o componente devolve null quando o usuário
          não é dono de duas ou mais unidades. */}
      <CobrancaDaRede />
    </div>
  )
}
