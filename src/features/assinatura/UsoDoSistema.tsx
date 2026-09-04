import { useEffect, useState } from 'react'
import { Activity, CalendarCheck, MessageSquareText, RotateCcw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSalon } from '../auth/useSalon'
import { Badge } from '../../components/Badge'
import { SkeletonLinhas } from '../../components/Skeleton'
import { ErroInline } from '../../components/ErroInline'

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function dataBr(iso: string) {
  return iso.split('-').reverse().join('/')
}

type Uso = {
  periodo_inicio: string
  periodo_fim: string
  barbeiros: number
  preco_unitario: number
  agendamentos: number
  valor_gerado: number
  lembretes: number
  reativacoes: number
}

type Fatura = {
  id: string
  periodo_inicio: string
  periodo_fim: string
  motivo: string
  agendamentos: number
  preco_unitario: number
  valor: number
  valor_gerado: number
  boleto_url: string | null
  boleto_valor: number | null
  boleto_vencimento: string | null
  paga_em: string | null
}

/**
 * O medidor do uso: o que o cliente paga e o que ele ganhou em troca.
 *
 * Mostra o PREÇO UNITÁRIO da barbearia — nunca a tabela de faixas por
 * barbeiros, decisão explícita de 2026-08-23. O mês corrente vem ao vivo da
 * view `uso_do_sistema_no_mes`; os períodos fechados vêm de `faturas_de_uso`,
 * congelados — a fatura não muda se um agendamento for cancelado depois.
 *
 * O par "valor gerado × custo" é a alma da tela: o dono precisa ver que o
 * agente trouxe muito mais do que custou, todo mês, sem procurar.
 */
export function UsoDoSistema() {
  const { salonId, isManager } = useSalon()
  const [uso, setUso] = useState<Uso | null>(null)
  const [faturas, setFaturas] = useState<Fatura[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    let cancelado = false
    async function carregar() {
      if (!salonId) return
      setCarregando(true)
      const [u, f] = await Promise.all([
        supabase.from('uso_do_sistema_no_mes').select('*').eq('salon_id', salonId).maybeSingle(),
        supabase
          .from('faturas_de_uso')
          .select(
            'id, periodo_inicio, periodo_fim, motivo, agendamentos, preco_unitario, valor, valor_gerado, boleto_url, boleto_valor, boleto_vencimento, paga_em',
          )
          .eq('salon_id', salonId)
          .order('periodo_fim', { ascending: false })
          .limit(12),
      ])
      if (cancelado) return
      if (u.error || f.error) {
        console.error('Erro ao carregar o uso:', u.error ?? f.error)
        setErro(true)
        setCarregando(false)
        return
      }
      setErro(false)
      setUso(u.data as Uso | null)
      setFaturas((f.data ?? []) as Fatura[])
      setCarregando(false)
    }
    carregar()
    return () => {
      cancelado = true
    }
  }, [salonId])

  if (!isManager) return null

  const valorEstimado = uso ? uso.agendamentos * Number(uso.preco_unitario) : 0
  // A cobrança mais recente ainda não paga: é o que o dono veio procurar
  // quando o assunto é boleto, então ganha um banner antes do histórico.
  const boletoAberto = faturas.find((f) => f.boleto_url && !f.paga_em) ?? null

  return (
    <section className="valores-alinhados bg-surface border border-border rounded-2xl shadow-sm p-5 space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Activity size={18} />
          Uso do sistema
        </h2>
        {/* A frase separa MENSAGEM de AGENDAMENTO, e não é preciosismo.
            A redação anterior juntava lembrete e reativação numa isenção só,
            enquanto a regra da fatura (`agendamentos_cobraveis`, migration
            0136) cobra o horário de reativação que o cliente confirma. Os dois
            cartões abaixo contam mensagens enviadas; o cartão "Agendamentos
            cobráveis" conta horários. Quem lesse aquilo entenderia que o
            cliente trazido de volta pela reativação sai de graça — e receberia
            R$ 0,75 por ele na fatura. Decisão de 04/09/2026: a regra fica, o
            texto muda. A catraca está em `promessaDeCobranca.test.ts`. */}
        <p className="text-sm text-muted-foreground mt-1">
          Você paga por agendamento que o atendimento automático marcou —{' '}
          {uso ? `${moeda(Number(uso.preco_unitario))} cada` : 'carregando...'}. Entra também o
          horário de reativação que o cliente confirmou. As mensagens de lembrete e de reativação
          não custam nada.
        </p>
      </div>

      {carregando ? (
        <SkeletonLinhas />
      ) : erro ? (
        <ErroInline>
          Não foi possível carregar o uso agora. Confira a internet e recarregue a página.
        </ErroInline>
      ) : uso ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-surface-2 rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarCheck size={14} /> Agendamentos cobráveis
              </div>
              <div className="text-xl font-semibold text-foreground mt-1">{uso.agendamentos}</div>
              <div className="text-[11px] text-muted-foreground">
                {moeda(valorEstimado)} no mês até agora
              </div>
            </div>
            <div className="bg-surface-2 rounded-lg p-3">
              <div className="text-xs text-muted-foreground">Gerado pra você</div>
              <div className="text-xl font-semibold text-success mt-1">
                {moeda(Number(uso.valor_gerado))}
              </div>
              <div className="text-[11px] text-muted-foreground">em serviços agendados</div>
            </div>
            <div className="bg-surface-2 rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MessageSquareText size={14} /> Lembretes
              </div>
              <div className="text-xl font-semibold text-foreground mt-1">{uso.lembretes}</div>
              {/* "mensagens" no rótulo, e não só "sem custo": este cartão conta
                  envios, não horários — a diferença é a que confundia acima. */}
              <div className="text-[11px] text-muted-foreground">mensagens, sem custo</div>
            </div>
            <div className="bg-surface-2 rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <RotateCcw size={14} /> Reativações
              </div>
              <div className="text-xl font-semibold text-foreground mt-1">{uso.reativacoes}</div>
              {/* O cartão mais perigoso da tela: "Reativações — sem custo" lia-se
                  como "cliente trazido de volta é de graça". Conta ENVIOS
                  (`reativacao_envios`); o horário confirmado que sair daí está
                  no cartão de cobráveis. */}
              <div className="text-[11px] text-muted-foreground">mensagens, sem custo</div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Período em aberto: {dataBr(uso.periodo_inicio)} até hoje. O fechamento é no fim do mês,
            e o boleto chega depois disso.
          </p>

          {boletoAberto && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning-soft p-3">
              <div className="text-sm text-foreground">
                Cobrança em aberto: <strong>{moeda(Number(boletoAberto.boleto_valor))}</strong>
                {boletoAberto.boleto_vencimento && (
                  <span className="text-muted-foreground">
                    {' '}
                    · vence {dataBr(boletoAberto.boleto_vencimento)}
                  </span>
                )}
              </div>
              <a
                href={boletoAberto.boleto_url!}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary rounded-lg px-3 py-1.5 text-sm font-medium shrink-0"
              >
                Pagar (boleto, Pix ou cartão)
              </a>
            </div>
          )}

          {faturas.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-foreground mb-2">Períodos fechados</h3>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {faturas.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0 text-sm text-foreground">
                      {dataBr(f.periodo_inicio)} – {dataBr(f.periodo_fim)}
                      {f.motivo === 'cancelamento' && (
                        <span className="ml-2 inline-flex align-middle">
                          <Badge variante="perigo">cancelamento</Badge>
                        </span>
                      )}
                      <span className="ml-2 text-[11px] text-muted-foreground">
                        {f.agendamentos} agendamento{f.agendamentos === 1 ? '' : 's'} ×{' '}
                        {moeda(Number(f.preco_unitario))}
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-2">
                      {f.paga_em ? (
                        <Badge variante="ok">pago</Badge>
                      ) : f.boleto_url ? (
                        <a
                          href={f.boleto_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-chip btn-chip-primario"
                        >
                          Pagar
                        </a>
                      ) : Number(f.valor) > 0 ? (
                        <Badge variante="atencao">acumula</Badge>
                      ) : null}
                      <span className="text-sm font-medium text-foreground">{moeda(Number(f.valor))}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Sem dados de uso ainda.</p>
      )}
    </section>
  )
}
