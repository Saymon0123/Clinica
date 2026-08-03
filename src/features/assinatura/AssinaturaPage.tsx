import { CreditCard, CheckCircle2, AlertTriangle, CalendarClock } from 'lucide-react'
import { useSalon } from '../auth/useSalon'
import { useAssinatura, type Assinatura } from './useAssinatura'
import { DadosDeCobranca } from './DadosDeCobranca'
import { AcoesDaAssinatura } from './AcoesDaAssinatura'
import { RecursosDoPlano } from './RecursosDoPlano'
import { TrocarPlano } from './TrocarPlano'

function moeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarData(iso: string) {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

function Situacao({ assinatura }: { assinatura: Assinatura }) {
  const { status, diasRestantes, expirada, acessoAte, temRecorrencia } = assinatura

  if (expirada) {
    return (
      <div className="flex items-start gap-2 text-danger">
        <AlertTriangle size={18} className="shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">
            {status === 'cancelada' ? 'Assinatura encerrada' : 'Teste encerrado'} em{' '}
            {formatarData(acessoAte!)}
          </p>
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

  // Cancelada mas ainda dentro do prazo: as cobranças pararam, o acesso não.
  // É a regra decidida em 2026-08-02, e precisa ficar explícita — senão o dono
  // cancela e fica sem saber se ainda pode usar.
  if (status === 'cancelada') {
    return (
      <div className="flex items-start gap-2">
        <CalendarClock size={18} className="shrink-0 mt-0.5 text-warning" />
        <div>
          <p className="font-medium text-foreground">Assinatura cancelada</p>
          <p className="text-sm text-muted-foreground">
            Não haverá novas cobranças
            {acessoAte
              ? `, e você segue com acesso até ${formatarData(acessoAte)}.`
              : '. O acesso permanece liberado.'}
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
          <p className="font-medium text-foreground">Pagamento em atraso</p>
          <p className="text-sm text-muted-foreground">
            {acessoAte
              ? `Seu acesso vai até ${formatarData(acessoAte)}. Pague a fatura em aberto para continuar.`
              : 'Pague a fatura em aberto para continuar.'}
          </p>
        </div>
      </div>
    )
  }

  // Pago em dia mas **sem recorrência**: o acesso vale até a data e para. Dizer
  // "assinatura ativa" e anunciar uma "próxima cobrança" que não existe faria a
  // tela prometer uma renovação que ninguém vai executar — e o dono só
  // descobriria no dia em que perdesse o acesso.
  if (!temRecorrencia) {
    return (
      <div className="flex items-start gap-2">
        <CalendarClock size={18} className="shrink-0 mt-0.5 text-warning" />
        <div>
          <p className="font-medium text-foreground">Sem renovação automática</p>
          <p className="text-sm text-muted-foreground">
            {acessoAte
              ? `Seu acesso vai até ${formatarData(acessoAte)} e não será renovado sozinho.`
              : 'Não há cobrança automática configurada.'}
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
          {acessoAte
            ? `Próxima cobrança em ${formatarData(acessoAte)}.`
            : 'Sem data de vencimento.'}
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

  // Dono de rede sem unidade escolhida: a assinatura é por unidade, então não
  // há o que mostrar até ele escolher qual.
  if (!salonId) {
    return (
      <p className="text-sm text-muted-foreground">
        Escolha uma barbearia para ver a assinatura dela.
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
          <h1 className="text-xl font-semibold text-foreground">Assinatura</h1>
          <p className="text-sm text-muted-foreground">{salonName ?? 'Sua barbearia'}</p>
        </div>
      </div>

      {erro ? (
        <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-lg p-4">
          {erro} Tente recarregar a página. Se continuar, avise o suporte.
        </p>
      ) : !assinatura ? (
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

          {/* Logo abaixo da situação, e não no rodapé: assinar é o que a pessoa
              veio fazer aqui. Antes ficava depois do CPF e da troca de plano,
              então era preciso rolar a página inteira para achar o botão.

              Só aparece com o documento preenchido — o Asaas exige CPF/CNPJ
              para criar o pagante, e sem ele o botão devolveria erro. */}
          {assinatura.cpfCnpj && (
            <AcoesDaAssinatura salonId={salonId} assinatura={assinatura} onMudou={reload} />
          )}

          <RecursosDoPlano assinatura={assinatura} />

          <TrocarPlano salonId={salonId} assinatura={assinatura} onMudou={reload} />

          <DadosDeCobranca
            salonId={salonId}
            documentoAtual={assinatura.cpfCnpj}
            onSalvo={reload}
          />

          {/* Sem documento não há botão nenhum acima, e a página não diria o que
              falta fazer. */}
          {!assinatura.cpfCnpj && (
            <p className="text-sm text-muted-foreground">
              Informe o CPF ou CNPJ acima para poder assinar.
            </p>
          )}
        </>
      )}
    </div>
  )
}
