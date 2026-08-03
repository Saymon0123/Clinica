import { useState } from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Assinatura } from './useAssinatura'

function moeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarData(iso: string) {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

type Fatura = { invoiceUrl: string; vencimento: string; valor: number }

/**
 * Assinar e cancelar.
 *
 * O botão de assinar não conclui pagamento: ele cria a recorrência no Asaas e
 * devolve a **fatura**, que abre em outra aba para o dono pagar por Pix. O
 * acesso só muda quando o weblhook confirma — é por isso que a tela avisa que a
 * liberação é automática, senão o dono paga, volta e acha que não funcionou.
 */
export function AcoesDaAssinatura({
  salonId,
  assinatura,
  onMudou,
}: {
  salonId: string
  assinatura: Assinatura
  onMudou: () => void
}) {
  const [carregando, setCarregando] = useState<'assinar' | 'cancelar' | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [fatura, setFatura] = useState<Fatura | null>(null)
  const [confirmandoCancelamento, setConfirmandoCancelamento] = useState(false)

  // Pela recorrência, não pelo status: entre assinar e o pagamento cair a
  // assinatura ainda é `trial`, e oferecer "Assinar" de novo criaria confusão
  // (e uma segunda cobrança, se o dono clicasse).
  const assinada = assinatura.temRecorrencia

  async function chamar(acao: 'assinar' | 'cancelar') {
    setCarregando(acao)
    setErro(null)
    try {
      const { data, error } = await supabase.functions.invoke('asaas', {
        body: { salonId, acao },
      })
      if (error || data?.error) {
        setErro(data?.error ?? 'Não foi possível concluir agora. Tente de novo em instantes.')
        return
      }
      if (acao === 'assinar' && data?.invoiceUrl) {
        setFatura(data as Fatura)
        window.open(data.invoiceUrl, '_blank', 'noopener,noreferrer')
      }
      setConfirmandoCancelamento(false)
      onMudou()
    } catch (err) {
      console.error(`Erro ao ${acao} a assinatura:`, err)
      setErro('Não foi possível concluir agora. Tente de novo em instantes.')
    } finally {
      setCarregando(null)
    }
  }

  // Sem cartão próprio: vive dentro do bloco da situação, para ficar claro que
  // as ações agem sobre o plano mostrado logo acima.
  return (
    <div>
      {erro && <p className="text-sm text-danger mb-3">{erro}</p>}

      {fatura && (
        <div className="mb-3 p-3 rounded-lg bg-primary-soft border border-border">
          <p className="text-sm font-medium text-primary-soft-foreground">
            Fatura de {moeda(fatura.valor)}, vencendo em {formatarData(fatura.vencimento)}
          </p>
          <a
            href={fatura.invoiceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm underline mt-1 text-primary-soft-foreground"
          >
            Abrir a fatura para pagar
            <ExternalLink size={13} />
          </a>
          {/* Sem este aviso o dono paga, volta na hora e acha que falhou. */}
          <p className="text-xs text-muted-foreground mt-2">
            Assim que o pagamento cair, o acesso é liberado automaticamente.
          </p>
        </div>
      )}

      {!assinada ? (
        <>
          <button
            onClick={() => chamar('assinar')}
            disabled={carregando !== null}
            className="btn-primary rounded-lg px-4 py-2 text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
          >
            {carregando === 'assinar' && <Loader2 size={15} className="animate-spin" />}
            {assinatura.status === 'cancelada' ? 'Assinar de novo' : 'Assinar agora'}
          </button>
          <p className="text-xs text-muted-foreground mt-2">
            Cobrança mensal por Pix. Você pode cancelar quando quiser.
          </p>
        </>
      ) : confirmandoCancelamento ? (
        <div>
          <p className="text-sm text-foreground">Cancelar a assinatura?</p>
          {/* A regra que tira o medo de clicar. */}
          <p className="text-sm text-muted-foreground mt-1">
            As próximas cobranças param, e você continua usando o CRM normalmente até{' '}
            {assinatura.acessoAte ? formatarData(assinatura.acessoAte) : 'o fim do período pago'} —
            o tempo já pago não se perde.
          </p>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => chamar('cancelar')}
              disabled={carregando !== null}
              className="inline-flex items-center gap-2 rounded-lg border border-danger/40 text-danger px-3 py-1.5 text-sm font-medium hover:bg-danger-soft disabled:opacity-50"
            >
              {carregando === 'cancelar' && <Loader2 size={15} className="animate-spin" />}
              Sim, cancelar
            </button>
            <button
              onClick={() => setConfirmandoCancelamento(false)}
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Voltar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setConfirmandoCancelamento(true)}
          className="text-sm font-medium text-muted-foreground hover:text-danger"
        >
          Cancelar assinatura
        </button>
      )}
    </div>
  )
}
