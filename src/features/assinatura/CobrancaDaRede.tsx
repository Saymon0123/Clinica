import { useCallback, useEffect, useState } from 'react'
import { Building2, ExternalLink, Receipt } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { invokeFunction } from '../../lib/invokeFunction'
import { useSalon } from '../auth/useSalon'

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

type LinhaUnidade = {
  salonId: string
  nome: string
  plano: string
  status: string
  valor: number | null
  acessoAte: string | null
}

type Rede = {
  cobrancaUnificada: boolean
  cpfCnpj: string | null
}

const ROTULO_STATUS: Record<string, string> = {
  trial: 'teste',
  pendente: 'aguardando pagamento',
  ativa: 'ativa',
  atrasada: 'atrasada',
  cancelada: 'cancelada',
}

/**
 * Cobrança da rede: as assinaturas de todas as unidades, e o formato do boleto.
 *
 * **A cobrança continua nascendo por unidade** — cada `subscriptions` é a
 * verdade sobre o plano e o valor da sua loja, e é nela que o modelo de preço
 * novo vai mexer quando for definido. O que a rede escolhe aqui é só o formato
 * do boleto: um por unidade (padrão), ou um único com a soma de todas.
 *
 * Quem liga e desliga a unificação é a edge function `asaas`, nunca um update
 * direto: mudar a flag sem cancelar as recorrências por unidade no Asaas
 * cobraria a rede em dobro.
 */
export function CobrancaDaRede() {
  const { salonId, organizationId, unidades, isNetwork } = useSalon()
  const proprias = unidades.filter((u) => u.role === 'owner')

  const [linhas, setLinhas] = useState<LinhaUnidade[]>([])
  const [rede, setRede] = useState<Rede | null>(null)
  const [cpfCnpj, setCpfCnpj] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [agindo, setAgindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [faturaUrl, setFaturaUrl] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!organizationId || proprias.length < 2) return
    setCarregando(true)

    const [org, subs] = await Promise.all([
      supabase
        .from('organizations')
        .select('cobranca_unificada, cpf_cnpj')
        .eq('id', organizationId)
        .maybeSingle(),
      supabase
        .from('subscriptions')
        .select('salon_id, plan_codigo, status, valor, acesso_ate')
        .in(
          'salon_id',
          proprias.map((u) => u.salonId),
        ),
    ])

    // Numa constante antes do callback: dentro dele o TypeScript perde o
    // estreitamento do if, e `org.data` volta a ser possivelmente nulo — foi o
    // erro que segurou o build de produção por um dia (TS18047).
    const dadosDaRede = org.data
    if (dadosDaRede) {
      setRede({ cobrancaUnificada: dadosDaRede.cobranca_unificada, cpfCnpj: dadosDaRede.cpf_cnpj })
      setCpfCnpj((atual) => atual || dadosDaRede.cpf_cnpj || '')
    }
    setLinhas(
      proprias.map((u) => {
        const sub = (subs.data ?? []).find((s) => s.salon_id === u.salonId)
        return {
          salonId: u.salonId,
          nome: u.nome,
          plano: sub?.plan_codigo ?? '—',
          status: sub?.status ?? 'sem plano',
          valor: sub?.valor != null ? Number(sub.valor) : null,
          acessoAte: sub?.acesso_ate ?? null,
        }
      }),
    )
    setCarregando(false)
    // proprias é derivado de `unidades`; a identidade muda a cada render, mas o
    // conteúdo só muda quando `unidades` muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, unidades])

  useEffect(() => {
    carregar()
  }, [carregar])

  if (!isNetwork || !organizationId || proprias.length < 2) return null

  const total = linhas.reduce((acc, l) => acc + (l.valor ?? 0), 0)

  async function unificar() {
    setAgindo(true)
    setErro(null)
    setFaturaUrl(null)
    const { data, error } = await invokeFunction<{ invoiceUrl: string | null; total: number }>(
      'asaas',
      { body: { acao: 'assinar-rede', organizationId, cpfCnpj: cpfCnpj.trim() || undefined } },
      'Não foi possível unificar a cobrança.',
    )
    setAgindo(false)
    if (error) {
      setErro(error)
      return
    }
    setFaturaUrl(data?.invoiceUrl ?? null)
    if (data?.invoiceUrl) window.open(data.invoiceUrl, '_blank', 'noopener')
    await carregar()
  }

  async function separar() {
    // Janela de confirmação nativa mesmo: a ação desfaz a recorrência da rede
    // no Asaas, e cada unidade fica sem cobrança até assinar de novo.
    if (
      !window.confirm(
        'Separar as cobranças? A recorrência única da rede é cancelada e cada unidade volta a assinar sozinha, pela própria aba Assinatura.',
      )
    ) {
      return
    }
    setAgindo(true)
    setErro(null)
    const { error } = await invokeFunction(
      'asaas',
      { body: { acao: 'separar-rede', organizationId } },
      'Não foi possível separar a cobrança.',
    )
    setAgindo(false)
    if (error) {
      setErro(error)
      return
    }
    await carregar()
  }

  return (
    <section className="bg-surface border border-border rounded-xl p-5 space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Building2 size={18} />
          Cobrança da rede
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Cada unidade tem a própria assinatura. Aqui você escolhe o formato do boleto: um por
          unidade, ou um único com todas.
        </p>
      </div>

      {carregando ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {linhas.map((l) => (
              <li key={l.salonId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <span className="text-sm text-foreground">{l.nome}</span>
                  <span className="ml-2 text-[11px] text-muted-foreground">
                    {l.plano} · {ROTULO_STATUS[l.status] ?? l.status}
                    {l.salonId === salonId ? ' · unidade atual' : ''}
                  </span>
                </div>
                <span className="text-sm font-medium text-foreground">
                  {l.valor != null ? `${moeda(l.valor)}/mês` : '—'}
                </span>
              </li>
            ))}
            <li className="flex items-center justify-between px-3 py-2 bg-surface-2">
              <span className="text-sm font-semibold text-foreground">Total da rede</span>
              <span className="text-sm font-semibold text-foreground">{moeda(total)}/mês</span>
            </li>
          </ul>

          {rede?.cobrancaUnificada ? (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm text-success">
                <Receipt size={16} />
                Cobrança unificada ativa: um boleto de {moeda(total)} cobre as {linhas.length}{' '}
                unidades.
              </p>
              {faturaUrl && (
                <a
                  href={faturaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  Abrir a fatura <ExternalLink size={14} />
                </a>
              )}
              <button
                type="button"
                onClick={separar}
                disabled={agindo}
                className="text-sm text-danger hover:underline disabled:opacity-50"
              >
                {agindo ? 'Separando...' : 'Separar as cobranças'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block max-w-xs">
                <span className="text-xs font-medium text-muted-foreground">
                  CPF ou CNPJ do pagante da rede
                </span>
                <input
                  value={cpfCnpj}
                  onChange={(e) => setCpfCnpj(e.target.value)}
                  placeholder="00.000.000/0000-00"
                  className="mt-1 w-full border border-border-strong bg-surface text-foreground rounded px-3 py-2 text-sm"
                />
              </label>
              <button
                type="button"
                onClick={unificar}
                disabled={agindo}
                className="inline-flex items-center gap-2 btn-primary rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                <Receipt size={16} />
                {agindo ? 'Unificando...' : `Unificar em um boleto de ${moeda(total)}`}
              </button>
              <p className="text-xs text-muted-foreground">
                As cobranças individuais no financeiro são canceladas e nasce uma única recorrência
                mensal da rede. O pagamento dela libera todas as unidades de uma vez. Dá para
                separar de novo quando quiser.
              </p>
            </div>
          )}

          {erro && <p className="text-sm text-danger">{erro}</p>}
        </>
      )}
    </section>
  )
}
