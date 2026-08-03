import { useEffect, useState } from 'react'
import { ArrowRight, ExternalLink, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Assinatura } from './useAssinatura'

type Plano = { codigo: string; nome: string; preco_unidade: number }

type Simulacao = {
  plano: string
  planoNome: string
  precoNovo: number
  subida: boolean
  valor: number
  diasRestantes: number
  imediata: boolean
}

function moeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarData(iso: string) {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

/**
 * Troca de plano pelo próprio CRM.
 *
 * O valor mostrado vem da **mesma conta** que gera a cobrança, pedido à edge
 * function antes de confirmar. Calcular aqui e cobrar lá seria a receita para o
 * dono ver um número e pagar outro.
 *
 * Regras de 2026-08-02: subir custa a diferença proporcional aos dias que
 * faltam e vale quando o Pix cai; descer vale na renovação, sem devolução e sem
 * perder o que já foi pago.
 */
export function TrocarPlano({
  salonId,
  assinatura,
  onMudou,
}: {
  salonId: string
  assinatura: Assinatura
  onMudou: () => void
}) {
  const [planos, setPlanos] = useState<Plano[]>([])
  const [simulacao, setSimulacao] = useState<Simulacao | null>(null)
  const [carregando, setCarregando] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [fatura, setFatura] = useState<{ invoiceUrl: string; valor: number } | null>(null)

  useEffect(() => {
    supabase
      .from('plans')
      .select('codigo, nome, preco_unidade')
      .eq('ativo', true)
      .order('preco_unidade')
      .then(({ data }) => setPlanos((data as Plano[]) ?? []))
  }, [])

  const outros = planos.filter((p) => p.codigo !== assinatura.planoCodigo)

  async function chamar(
    acao: 'simular-troca' | 'trocar-plano' | 'cancelar-troca',
    plano?: string,
  ) {
    setCarregando(plano ?? acao)
    setErro(null)
    try {
      const { data, error } = await supabase.functions.invoke('asaas', {
        body: { salonId, acao, plano },
      })
      if (error || data?.error) {
        setErro(data?.error ?? 'Não foi possível concluir agora. Tente de novo em instantes.')
        return null
      }
      return data
    } catch (err) {
      console.error(`Erro ao ${acao}:`, err)
      setErro('Não foi possível concluir agora. Tente de novo em instantes.')
      return null
    } finally {
      setCarregando(null)
    }
  }

  async function escolher(plano: string) {
    const data = await chamar('simular-troca', plano)
    if (data) {
      setSimulacao(data as Simulacao)
      setConfirmando(true)
    }
  }

  async function confirmar() {
    if (!simulacao) return
    const data = await chamar('trocar-plano', simulacao.plano)
    if (!data) return
    if (data.invoiceUrl) {
      setFatura({ invoiceUrl: data.invoiceUrl, valor: data.valor })
      window.open(data.invoiceUrl, '_blank', 'noopener,noreferrer')
    }
    setConfirmando(false)
    setSimulacao(null)
    onMudou()
  }

  // Troca já pedida: oferecer outra criaria uma segunda cobrança em aberto.
  if (assinatura.planoAgendado) {
    // Dizer **para qual** plano vai. Sem o nome, o card anunciava uma mudança
    // sem destino e o topo da tela seguia mostrando o plano antigo — o dono não
    // tinha como saber o que tinha pedido.
    const destino =
      planos.find((p) => p.codigo === assinatura.planoAgendado)?.nome ?? assinatura.planoAgendado

    return (
      <div className="bg-surface border border-border rounded-xl p-4">
        <h2 className="text-sm font-semibold text-foreground mb-1">
          Mudança para o {destino} em andamento
        </h2>
        <p className="text-sm text-muted-foreground">
          {assinatura.aguardandoPagamentoDaTroca
            ? `Assim que o pagamento da diferença cair, o ${destino} é liberado automaticamente.`
            : `A mudança vale a partir de ${
                assinatura.acessoAte ? formatarData(assinatura.acessoAte) : 'a próxima renovação'
              }. Até lá você continua com tudo do plano atual, que já está pago.`}
        </p>

        {erro && <p className="text-sm text-danger mt-2">{erro}</p>}

        {/* O caminho de volta. Sem ele, pedir a troca era decisão sem desfazer:
            o bloco de escolher plano sumia e nada trazia o dono de volta. */}
        <button
          onClick={async () => {
            const data = await chamar('cancelar-troca')
            if (data) onMudou()
          }}
          disabled={carregando !== null}
          className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {carregando === 'cancelar-troca' && <Loader2 size={14} className="animate-spin" />}
          Desistir da mudança
        </button>
      </div>
    )
  }

  if (outros.length === 0) return null

  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <h2 className="text-sm font-semibold text-foreground mb-3">Mudar de plano</h2>

      {erro && <p className="text-sm text-danger mb-3">{erro}</p>}

      {fatura && (
        <div className="mb-3 p-3 rounded-lg bg-primary-soft border border-border">
          <a
            href={fatura.invoiceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm underline text-primary-soft-foreground"
          >
            Pagar {moeda(fatura.valor)} para liberar o plano novo
            <ExternalLink size={13} />
          </a>
        </div>
      )}

      {confirmando && simulacao ? (
        <div>
          <p className="text-sm text-foreground font-medium">
            Mudar para o {simulacao.planoNome} — {moeda(simulacao.precoNovo)}/mês
          </p>

          <p className="text-sm text-muted-foreground mt-1">
            {!simulacao.subida ? (
              <>
                A mudança vale na próxima renovação
                {assinatura.acessoAte ? `, em ${formatarData(assinatura.acessoAte)}` : ''}. Até lá
                você segue com o plano atual, que já está pago — nada do que você pagou se perde.
              </>
            ) : simulacao.valor === 0 ? (
              <>Sem custo adicional agora. O plano novo vale imediatamente.</>
            ) : (
              <>
                Você paga <strong className="text-foreground">{moeda(simulacao.valor)}</strong>{' '}
                agora, referente aos {simulacao.diasRestantes} dias que faltam no período já pago —
                não a mensalidade cheia. O plano novo é liberado assim que o Pix cair.
              </>
            )}
          </p>

          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={confirmar}
              disabled={carregando !== null}
              className="btn-primary rounded-lg px-4 py-2 text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
            >
              {carregando !== null && <Loader2 size={15} className="animate-spin" />}
              {!simulacao.subida ? 'Agendar a mudança' : 'Confirmar'}
            </button>
            <button
              onClick={() => {
                setConfirmando(false)
                setSimulacao(null)
              }}
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Voltar
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {outros.map((p) => (
            <button
              key={p.codigo}
              onClick={() => escolher(p.codigo)}
              disabled={carregando !== null}
              className="w-full flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-sm hover:border-border-strong disabled:opacity-50"
            >
              <span className="text-foreground font-medium">{p.nome}</span>
              <span className="flex items-center gap-2 text-muted-foreground tabular-nums">
                {moeda(Number(p.preco_unidade))}/mês
                {carregando === p.codigo ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <ArrowRight size={14} />
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
